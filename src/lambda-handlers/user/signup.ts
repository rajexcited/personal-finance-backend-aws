import { APIGatewayProxyEvent } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { AuthRole } from "../common";
import { getSignedToken } from "../auth";
import {
  apiGatewayHandlerWrapper,
  RequestBodyContentType,
  ValidationError,
  InvalidField,
  NotFoundError,
  convertToCreatedResponse,
} from "../apigateway";
import { getLogger, utils, AuditDetailsType, LoggerBase, validations, dbutil, s3utils } from "../utils";
import {
  _logger as userLogger,
  _userTableName,
  _userEmailGsiName,
  getDetailsTablePk,
  getEmailGsiPk,
  getTokenTablePk,
  UserResourcePath,
  ErrorMessage,
} from "./base-config";
import { encrypt } from "./pcrypt";
import { DbUserDetails, DbItemUser, DbItemToken, ApiUserResource } from "./resource-type";
import { BelongsTo, DbConfigTypeDetails, DefaultConfigData, _configDataBucketName, addDefaultConfigTypes } from "../config-type";
import { DefaultPaymentAccounts } from "../pymt-acc/resource-type";
import { JSONObject } from "../apigateway";
import { addDefaultPymtAccounts } from "../pymt-acc";
import { StopWatch } from "stopwatch-node";
import { getAllCountries, getCurrencyByCountry } from "../settings";

const _logger = getLogger("signup", userLogger);

const COUNTRY_CODE_MAX_LENGTH = 5;

const signupHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("handler", _logger);
  const stopwatch = new StopWatch("signupHandler");

  try {
    stopwatch.start("prepareUserDetails");
    const req = await getValidatedRequestForSignup(event, logger);
    const transactionWriter = new dbutil.TransactionWriter(logger);

    const phash = await encrypt(req.password as string);
    const userId = uuidv4();
    const auditDetails = utils.updateAuditDetails(null, userId) as AuditDetailsType;
    const apiToDbDetails: DbUserDetails = {
      id: userId,
      emailId: req.emailId as string,
      firstName: req.firstName as string,
      lastName: req.lastName as string,
      phash: phash,
      auditDetails: auditDetails,
      status: "active",
    };
    const dbDetailItem: DbItemUser = {
      PK: getDetailsTablePk(apiToDbDetails.id),
      E_GSI_PK: getEmailGsiPk(apiToDbDetails.emailId),
      details: apiToDbDetails,
    };
    transactionWriter.putItems(dbDetailItem as unknown as JSONObject, _userTableName);

    stopwatch.stop();
    logger.info("dbDetailItem to be updated", dbDetailItem, "summary", stopwatch.shortSummary());

    // init config
    const confInit = await initUserConfigurations(apiToDbDetails.id, req.countryCode as string, stopwatch, transactionWriter);
    // init payment account
    stopwatch.start("payment-account");
    const pymtAccounts = await initPaymentAccount(apiToDbDetails.id, confInit, transactionWriter);
    stopwatch.stop();

    stopwatch.start("addingNewUser");
    const accessTokenObj = await getSignedToken(apiToDbDetails.id, AuthRole.PRIMARY);
    const dbTokenItem: DbItemToken = {
      PK: getTokenTablePk(apiToDbDetails.id),
      ExpiresAt: accessTokenObj.getExpiresAt().toSeconds(),
      details: {
        iat: accessTokenObj.iat,
        tokenExpiresAt: accessTokenObj.getExpiresAt().toMillis(),
      },
    };

    transactionWriter.putItems(dbTokenItem as unknown as JSONObject, _userTableName);
    await transactionWriter.executeTransaction();
    // await dbutil.batchAddUpdate([dbDetailItem, dbTokenItem], _userTableName, logger);

    logger.info("accessTokenObj", accessTokenObj);
    const result = {
      accessToken: accessTokenObj.token,
      expiresIn: accessTokenObj.expiresIn(),
      expiryTime: accessTokenObj.getExpiresAt().toMillis(),
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
      ":pk": getEmailGsiPk(req.emailId as string),
    },
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
const initUserConfigurations = async (userId: string, countryCode: string, stopwatch: StopWatch, transactionWriter: dbutil.TransactionWriter) => {
  const logger = getLogger("initUserConfigurations", _logger);
  // create default expense categories
  stopwatch.start(BelongsTo.ExpenseCategory);
  const xpnsCtgr = await addDefaultConfig("default-expense-categories.json", BelongsTo.ExpenseCategory, userId, logger, transactionWriter);
  stopwatch.stop();
  // create default payment account types
  stopwatch.start(BelongsTo.PaymentAccountType);
  const pymtAccTyp = await addDefaultConfig("default-payment-account-types.json", BelongsTo.PaymentAccountType, userId, logger, transactionWriter);
  stopwatch.stop();
  // create default currency profiles
  stopwatch.start(BelongsTo.CurrencyProfile);
  const currPrf = await addCurrencyConfig(countryCode, userId, logger, transactionWriter);
  stopwatch.stop();
  logger.info("all config types are added to new user");
  const confInitEntries = [
    [BelongsTo.ExpenseCategory, xpnsCtgr],
    [BelongsTo.PaymentAccountType, pymtAccTyp],
    [BelongsTo.CurrencyProfile, currPrf],
  ];

  const confInit = Object.fromEntries(confInitEntries);
  return confInit as Record<BelongsTo, DbConfigTypeDetails[]>;
};

const addDefaultConfig = async (
  s3Key: string,
  belongsTo: BelongsTo,
  userId: string,
  baseLogger: LoggerBase,
  transactionWriter: dbutil.TransactionWriter
) => {
  const logger = getLogger(belongsTo, baseLogger);

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
    const configs = await addDefaultConfigTypes(filteredData, belongsTo, userId, transactionWriter);
    logger.info(belongsTo + " config types are added to user");
    return configs;
  }
  return [];
};

const addCurrencyConfig = async (countryCode: string, userId: string, baseLogger: LoggerBase, transactionWriter: dbutil.TransactionWriter) => {
  const belongsTo = BelongsTo.CurrencyProfile;
  const logger = getLogger(belongsTo, baseLogger);

  const currencyConfigData = await getCurrencyByCountry(logger);
  const matchingCurrencyProfile = currencyConfigData.find((currencyCfg) => currencyCfg.country.code === countryCode);

  if (matchingCurrencyProfile) {
    logger.info("matchingCurrencyProfile", matchingCurrencyProfile);
    // create
    const configData: DefaultConfigData = {
      name: matchingCurrencyProfile.country.code,
      value: matchingCurrencyProfile.currency.code,
      tags: [],
      description: `currency profile for country, ${matchingCurrencyProfile.country.name} and currency, ${matchingCurrencyProfile.currency.name}`,
    };
    const configs = await addDefaultConfigTypes([configData], belongsTo, userId, transactionWriter);
    logger.info(belongsTo + " config types are added to user");
    return configs;
  }
  return [];
};

const initPaymentAccount = async (
  userId: string,
  confInit: Record<BelongsTo, DbConfigTypeDetails[]>,
  transactionWriter: dbutil.TransactionWriter
) => {
  // add default payment accounts
  const logger = getLogger("initPaymentAccount", _logger);

  const s3Key = "default-payment-accounts.json";

  const pymtAccs = await s3utils.getJsonObjectFromS3<DefaultPaymentAccounts[]>(_configDataBucketName, s3Key, logger);
  if (pymtAccs) {
    logger.info(
      "pymtAccs.length",
      pymtAccs.length,
      "payment Account shortNames",
      pymtAccs.map((p) => p.shortName)
    );
    const pymtAccTyp = confInit[BelongsTo.PaymentAccountType];
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
    // create
    const pymtAccounts = await addDefaultPymtAccounts(pymtAccs, userId, transactionWriter);
    logger.info("Payment Accounts are added to user");
    return pymtAccounts;
  }
  return [];
};

const isValidCountryCode = async (countryCode: string | null | undefined) => {
  const logger = getLogger("isValidCountryCode", _logger);
  const validLength = validations.isValidLength(countryCode, 2, COUNTRY_CODE_MAX_LENGTH);
  if (!validLength) return false;

  const countries = await getAllCountries(logger);
  const foundCountry = countries.find((c) => c.code === countryCode);

  return !!foundCountry;
};
