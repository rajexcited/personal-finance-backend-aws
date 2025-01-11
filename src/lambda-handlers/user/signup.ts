import { APIGatewayProxyEvent } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { AuthRole } from "../common";
import { getSignedToken } from "../auth";
import { apiGatewayHandlerWrapper, RequestBodyContentType, ValidationError, InvalidField, NotFoundError, convertToCreatedResponse, MissingError } from "../apigateway";
import { getLogger, utils, LoggerBase, validations, dbutil, s3utils } from "../utils";
import {
  _logger as userLogger,
  _userTableName,
  _userEmailGsiName,
  getDetailsTablePk,
  getEmailGsiPk,
  getTokenTablePk,
  UserResourcePath,
  ErrorMessage
} from "./base-config";
import { encrypt, initiate } from "./pcrypt";
import { DbUserDetails, DbItemUser, DbItemToken, ApiUserResource, AuthorizeUser, DbUserStatus } from "./resource-type";
import { ConfigBelongsTo, DbConfigTypeDetails, DefaultConfigData, _configDataBucketName, addDefaultConfigTypes } from "../config-type";
import { DefaultPaymentAccounts } from "../pymt-acc/resource-type";
import { JSONObject } from "../apigateway";
import { addDefaultPymtAccounts } from "../pymt-acc";
import { StopWatch } from "stopwatch-node";
import { getAllCountries, getCurrencyByCountry } from "../settings";

const _logger = getLogger("signup", userLogger);

const COUNTRY_CODE_MAX_LENGTH = 5;

const signupHandler = async (event: APIGatewayProxyEvent) => {
  initiate();
  const logger = getLogger("handler", _logger);
  const stopwatch = new StopWatch("signupHandler");

  try {
    stopwatch.start("prepareUserDetails");
    const req = await getValidatedRequestForSignup(event, logger);
    const transactionWriter = new dbutil.TransactionWriter(logger);

    const phash = await encrypt(req.password as string);
    const userId = uuidv4();
    const primaryUser: AuthorizeUser = {
      role: AuthRole.PRIMARY,
      userId: userId
    };
    const auditDetails = utils.updateAuditDetailsFailIfNotExists(null, primaryUser);
    const apiToDbDetails: DbUserDetails = {
      id: userId,
      emailId: req.emailId as string,
      firstName: req.firstName as string,
      lastName: req.lastName as string,
      phash: phash,
      auditDetails: auditDetails,
      status: DbUserStatus.ACTIVE_USER
    };
    const dbDetailItem: DbItemUser = {
      PK: getDetailsTablePk(apiToDbDetails.id),
      E_GSI_PK: getEmailGsiPk(apiToDbDetails.emailId),
      details: apiToDbDetails
    };
    transactionWriter.putItems(dbDetailItem as unknown as JSONObject, _userTableName);

    stopwatch.stop();
    logger.info("dbDetailItem to be updated", dbDetailItem, "summary", stopwatch.shortSummary());

    // init config
    const confInit = await initUserConfigurations(primaryUser, req.countryCode as string, stopwatch, transactionWriter);
    // init payment account
    stopwatch.start("payment-accounts");
    const pymtAccounts = await initPaymentAccount(primaryUser, confInit, transactionWriter);
    stopwatch.stop();

    stopwatch.start("addingNewUser");
    const accessTokenObj = await getSignedToken(apiToDbDetails.id, AuthRole.PRIMARY);
    const dbTokenItem: DbItemToken = {
      PK: getTokenTablePk(apiToDbDetails.id),
      ExpiresAt: accessTokenObj.getExpiresAt().toSeconds(),
      details: {
        iat: accessTokenObj.iat,
        tokenExpiresAt: accessTokenObj.getExpiresAt().toMillis()
      }
    };

    transactionWriter.putItems(dbTokenItem as unknown as JSONObject, _userTableName);
    await transactionWriter.executeTransaction();
    // await dbutil.batchAddUpdate([dbDetailItem, dbTokenItem], _userTableName, logger);

    logger.info("accessTokenObj", accessTokenObj);
    const result = {
      headers: {
        Authorization: `Bearer ${accessTokenObj.token}`
      },
      body: {
        expiresIn: accessTokenObj.expiresIn(),
        expiryTime: accessTokenObj.getExpiresAt().toMillis()
      }
    };

    return convertToCreatedResponse(result);
  } finally {
    stopwatch.stop();
    stopwatch.prettyPrint();
  }
};
export const signup = apiGatewayHandlerWrapper(signupHandler, RequestBodyContentType.JSON);

const getValidatedRequestForSignup = async (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("validateRequest", loggerBase);
  const req: ApiUserResource | null = utils.getJsonObj(event.body as string);
  logger.info("request =", req);

  if (!req) {
    throw new ValidationError([{ path: UserResourcePath.REQUEST, message: ErrorMessage.MISSING_VALUE }]);
  }
  const invalidFields: InvalidField[] = [];
  if (!validations.isValidPassword(req.password)) {
    const error = req.password ? ErrorMessage.INCORRECT_VALUE : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.PASSWORD, message: error });
  }
  if (!validations.isValidName(req.firstName)) {
    const error = req.firstName ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.FIRSTNAME, message: error });
  }
  if (!validations.isValidName(req.lastName)) {
    const error = req.lastName ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.LASTNAME, message: error });
  }
  if (!validations.isValidEmail(req.emailId)) {
    const error = req.emailId ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.EMAILID, message: error });
  }
  if (!isValidCountryCode(req.countryCode)) {
    const error = req.countryCode ? ErrorMessage.INCORRECT_VALUE : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.COUNTRY, message: error });
  }

  logger.info("invalidFields", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  const cmdInput = {
    TableName: _userTableName,
    IndexName: _userEmailGsiName,
    KeyConditionExpression: "E_GSI_PK = :pk",
    ExpressionAttributeValues: {
      ":pk": getEmailGsiPk(req.emailId as string)
    }
  };
  const output = await dbutil.queryOnce(cmdInput, logger);
  logger.info("query completed");

  // error if count value is greater than 0
  if (output.Count) {
    throw new ValidationError([{ path: UserResourcePath.EMAILID, message: ErrorMessage.EMAIL_ALREADY_EXISTS }]);
  }

  return req;
};

/**
 * call db to create default list of expense categories, payment account type, payment account
 *
 * @param userDetails
 */
const initUserConfigurations = async (authUser: AuthorizeUser, countryCode: string, stopwatch: StopWatch, transactionWriter: dbutil.TransactionWriter) => {
  const logger = getLogger("initUserConfigurations", _logger);
  const confInit: Partial<Record<ConfigBelongsTo, DbConfigTypeDetails[]>> = {};

  // create default configs
  stopwatch.start(ConfigBelongsTo.PurchaseType);
  const prchTyps = await addDefaultConfig(ConfigBelongsTo.PurchaseType, authUser, logger, transactionWriter);
  confInit[ConfigBelongsTo.PurchaseType] = prchTyps;
  stopwatch.stop();
  //
  stopwatch.start(ConfigBelongsTo.PaymentAccountType);
  const pymtAccTyps = await addDefaultConfig(ConfigBelongsTo.PaymentAccountType, authUser, logger, transactionWriter);
  confInit[ConfigBelongsTo.PaymentAccountType] = pymtAccTyps;
  stopwatch.stop();
  //
  stopwatch.start(ConfigBelongsTo.IncomeType);
  const incomeTyps = await addDefaultConfig(ConfigBelongsTo.IncomeType, authUser, logger, transactionWriter);
  confInit[ConfigBelongsTo.IncomeType] = incomeTyps;
  stopwatch.stop();
  //
  stopwatch.start(ConfigBelongsTo.RefundReason);
  const refundRsns = await addDefaultConfig(ConfigBelongsTo.RefundReason, authUser, logger, transactionWriter);
  confInit[ConfigBelongsTo.RefundReason] = refundRsns;
  stopwatch.stop();
  // create default currency profiles
  stopwatch.start(ConfigBelongsTo.CurrencyProfile);
  const currPrf = await addCurrencyConfig(countryCode, authUser, logger, transactionWriter);
  confInit[ConfigBelongsTo.CurrencyProfile] = currPrf;
  stopwatch.stop();
  logger.info("all config types are added to new user");

  return confInit;
};

const addDefaultConfig = async (belongsTo: ConfigBelongsTo, authUser: AuthorizeUser, baseLogger: LoggerBase, transactionWriter: dbutil.TransactionWriter) => {
  const logger = getLogger(belongsTo, baseLogger);

  const s3Key = `default/${belongsTo}.json`;
  const configData = await s3utils.getJsonObjectFromS3<DefaultConfigData[]>(_configDataBucketName, s3Key, logger);
  if (configData) {
    let filteredData = configData;

    logger.info(
      "filteredData.length",
      filteredData.length,
      "filteredData names",
      filteredData.map((d) => d.name)
    );
    // create
    const configs = await addDefaultConfigTypes(filteredData, belongsTo, authUser, transactionWriter);
    logger.info(belongsTo + " config types are added to user");
    return configs;
  }
  return [];
};

const addCurrencyConfig = async (countryCode: string, authUser: AuthorizeUser, baseLogger: LoggerBase, transactionWriter: dbutil.TransactionWriter) => {
  const belongsTo = ConfigBelongsTo.CurrencyProfile;
  const logger = getLogger(belongsTo, baseLogger);

  const currencyConfigData = await getCurrencyByCountry(logger);
  const matchingCurrencyProfile = currencyConfigData.find((currencyCfg) => currencyCfg.country.code === countryCode);

  if (!matchingCurrencyProfile) {
    throw new MissingError("currency profile for given country code[" + countryCode + "] not found.");
  }

  logger.info("matchingCurrencyProfile", matchingCurrencyProfile);
  // create
  const configData: DefaultConfigData = {
    name: matchingCurrencyProfile.country.code,
    value: matchingCurrencyProfile.currency.code,
    tags: [],
    description: `currency profile for country, ${matchingCurrencyProfile.country.name} and currency, ${matchingCurrencyProfile.currency.name}`
  };

  const configs = await addDefaultConfigTypes([configData], belongsTo, authUser, transactionWriter);
  logger.info(belongsTo + " config types are added to user");
  return configs;
};

const initPaymentAccount = async (
  authUser: AuthorizeUser,
  confInit: Partial<Record<ConfigBelongsTo, DbConfigTypeDetails[]>>,
  transactionWriter: dbutil.TransactionWriter
) => {
  // add default payment accounts
  const logger = getLogger("initPaymentAccount", _logger);

  const s3Key = "default/payment-accounts.json";

  const pymtAccs = await s3utils.getJsonObjectFromS3<DefaultPaymentAccounts[]>(_configDataBucketName, s3Key, logger);
  const pymtAccTyp = confInit[ConfigBelongsTo.PaymentAccountType];
  if (!pymtAccs || !pymtAccTyp) {
    throw new MissingError("payment accounts or payment account types not exist");
  }
  logger.info(
    "pymtAccs.length",
    pymtAccs.length,
    "payment Account shortNames",
    pymtAccs.map((p) => p.shortName)
  );
  const missingTypeNames: string[] = [];
  pymtAccs.forEach((pa) => {
    const paymentAccountTypeId = pymtAccTyp.find((pat) => pat.name === pa.typeName)?.id;
    if (!paymentAccountTypeId) {
      missingTypeNames.push(pa.typeName);
    } else {
      pa.typeName = paymentAccountTypeId;
    }
  });
  if (missingTypeNames.length) {
    throw new NotFoundError(`payment account types [${missingTypeNames.join(", ")}] are missing`);
  }
  const currencyProfiles = confInit[ConfigBelongsTo.CurrencyProfile];
  if (!currencyProfiles || currencyProfiles.length !== 1) {
    throw new MissingError("default currency profile not exist");
  }
  // create
  const pymtAccounts = await addDefaultPymtAccounts(pymtAccs, authUser, currencyProfiles[0], transactionWriter);
  logger.info("Payment Accounts are added to user");
  return pymtAccounts;
};

const isValidCountryCode = async (countryCode: string | null | undefined) => {
  const logger = getLogger("isValidCountryCode", _logger);
  const validLength = validations.isValidLength(countryCode, 2, COUNTRY_CODE_MAX_LENGTH);
  if (!validLength) return false;

  const countries = await getAllCountries(logger);
  const foundCountry = countries.find((c) => c.code === countryCode);

  return !!foundCountry;
};
