import { APIGatewayProxyEvent } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { Role, getSignedToken } from "../auth";
import { apiGatewayHandlerWrapper, RequestBodyContentType, ValidationError, InvalidField } from "../apigateway";
import { getLogger, utils, AuditDetailsType, LoggerBase, validations, dbutil } from "../utils";
import {
  _logger as userLogger,
  getDetailsTablePk,
  getEmailGsiPk,
  _userTableName,
  UserResourcePath,
  ErrorMessage,
  _userEmailGsiName,
  getTokenTablePk,
} from "./base-config";
import { encrypt } from "./pcrypt";
import { DbUserDetails, DbUserDetailItem, DbUserTokenItem, ApiUserResource } from "./resource-type";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BelongsTo, CurrencyProfileConfigData, DbConfigTypeDetails, DefaultConfigData, addConfigType } from "../config-type";
import { DefaultPaymentAccounts } from "../pymt-acc/resource-type";
import { JSONObject } from "../apigateway";
import { addPymtAccounts } from "../pymt-acc";

const _s3Client = new S3Client({});
const _logger = getLogger("signup", userLogger);

const signupHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("handler", _logger);
  const req = await getValidatedRequestForSignup(event, logger);
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
  const dbDetailItem: DbUserDetailItem = {
    PK: getDetailsTablePk(apiToDbDetails.id),
    E_GSI_PK: getEmailGsiPk(apiToDbDetails.emailId),
    details: apiToDbDetails,
  };
  logger.info("dbDetailItem to be updated", dbDetailItem);

  // init config
  const confInit = await initUserConfigurations(apiToDbDetails.id);
  // init payment account
  await initPaymentAccount(apiToDbDetails.id, confInit);

  const accessTokenObj = await getSignedToken(apiToDbDetails.id, Role.PRIMARY);
  const dbTokenItem: DbUserTokenItem = {
    PK: getTokenTablePk(apiToDbDetails.id),
    ExpiresAt: accessTokenObj.getExpiresAt().toSeconds(),
    details: {
      iat: accessTokenObj.iat,
      tokenExpiresAt: accessTokenObj.getExpiresAt().toMillis(),
    },
  };

  await dbutil.batchAddUpdate([dbDetailItem, dbTokenItem], _userTableName, logger);
  logger.info("accessTokenObj", accessTokenObj);

  return {
    accessToken: accessTokenObj.token,
    expiresIn: accessTokenObj.expiresIn(),
  };
};
export const signup = apiGatewayHandlerWrapper(signupHandler, RequestBodyContentType.JSON);

const getValidatedRequestForSignup = async (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("validateRequest", loggerBase);
  const req: ApiUserResource | null = utils.getJsonObj(event.body as string);
  logger.info("request=", req);

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
  logger.info("invalidFields", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  const output = await dbutil.ddbClient.query({
    TableName: _userTableName,
    IndexName: _userEmailGsiName,
    KeyConditionExpression: "E_GSI_PK = :pk",
    ExpressionAttributeValues: {
      ":pk": getEmailGsiPk(req.emailId as string),
    },
  });
  logger.info("output=", output);

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
const initUserConfigurations = async (userId: string) => {
  const logger = getLogger("initUserConfigurations", _logger);
  // create default expense categories
  const xpnsCtgr = await addDefaultConfig("default-expense-categories.json", BelongsTo.ExpenseCategory, userId, logger);
  // create default payment account types
  const pymtAccTyp = await addDefaultConfig("default-payment-account-types.json", BelongsTo.PaymentAccountType, userId, logger);
  // create default currency profiles
  const currPrf = await addDefaultCurrencyConfig("default-currency-profiles.json", userId, logger);
  logger.info("all config types are added to new user");
  const confInitEntries = [
    [BelongsTo.ExpenseCategory, xpnsCtgr],
    [BelongsTo.PaymentAccountType, pymtAccTyp],
    [BelongsTo.CurrencyProfile, currPrf],
  ];

  const confInit = Object.fromEntries(confInitEntries);
  return confInit;
};

const addDefaultConfig = async (s3Key: string, belongsTo: BelongsTo, userId: string, baseLogger: LoggerBase) => {
  const logger = getLogger(belongsTo, baseLogger);

  const configData = await getJsonObjectFromS3<DefaultConfigData[]>(s3Key, logger);
  if (configData) {
    let filteredData = configData;

    logger.info(
      "filteredData.length",
      filteredData.length,
      "filteredData names",
      filteredData.map((d) => d.name)
    );
    // create
    const configs = await addConfigType(filteredData, belongsTo, userId);
    logger.info(belongsTo + " config types are added to user");
    return configs;
  }
  return [];
};

const addDefaultCurrencyConfig = async (s3Key: string, userId: string, baseLogger: LoggerBase) => {
  const belongsTo = BelongsTo.CurrencyProfile;
  const logger = getLogger(belongsTo, baseLogger);

  const currencyConfigData = await getJsonObjectFromS3<CurrencyProfileConfigData[]>(s3Key, logger);
  if (currencyConfigData) {
    const filteredData = currencyConfigData.filter((currencyCfg) => currencyCfg.id === "USA-USD");

    logger.info(
      "filteredData.length",
      filteredData.length,
      "filteredData names",
      filteredData.map((d) => d.id)
    );
    // create
    const configData: DefaultConfigData[] = filteredData.map((cfg) => ({
      name: cfg.id,
      value: JSON.stringify(cfg),
      tags: [],
      description: cfg.description,
    }));
    const configs = await addConfigType(configData, belongsTo, userId);
    logger.info(belongsTo + " config types are added to user");
    return configs;
  }
  return [];
};

const initPaymentAccount = async (userId: string, confInit: JSONObject) => {
  // add default payment accounts
  const logger = getLogger("initPaymentAccount", _logger);

  const s3Key = "default-payment-accounts.json";

  const pymtAccs = await getJsonObjectFromS3<DefaultPaymentAccounts[]>(s3Key, logger);
  if (pymtAccs) {
    logger.info(
      "pymtAccs.length",
      pymtAccs.length,
      "payment Account shortNames",
      pymtAccs.map((p) => p.shortName)
    );
    const pymtAccTyp = confInit[BelongsTo.PaymentAccountType] as DbConfigTypeDetails[];
    pymtAccs.forEach((pa) => {
      const paymentAccountTypeId = pymtAccTyp.find((pat) => pat.name === pa.paymentAccountType)?.id;
      // either assign matching type or first type
      pa.paymentAccountType = paymentAccountTypeId || pymtAccTyp[0].id;
    });
    // create
    await addPymtAccounts(pymtAccs, userId);
    logger.info("Payment Accounts are added to user");
  }
};

async function getJsonObjectFromS3<T>(s3Key: string, baseLogger: LoggerBase): Promise<T | null> {
  const logger = getLogger("getJsonObjectFromS3", baseLogger);
  const configDataBucketName = process.env.CONFIG_DATA_BUCKET_NAME as string;
  logger.info("configDataBucketName", configDataBucketName, "key", s3Key);

  const s3Result = await _s3Client.send(new GetObjectCommand({ Bucket: configDataBucketName, Key: s3Key }));
  logger.info("keys in s3Result", Object.keys(s3Result), "s3 result", { ...s3Result, Body: null });

  const jsonString = await s3Result.Body?.transformToString();
  if (jsonString) {
    const configData = JSON.parse(jsonString);
    logger.info("retrieved json object from s3");
    return configData as T;
  }
  logger.warn("could not retrieve key object as string");
  return null;
}
