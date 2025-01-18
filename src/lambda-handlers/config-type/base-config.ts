import { APIGatewayProxyEvent } from "aws-lambda";
import { LoggerBase, getLogger, validations } from "../utils";
import { getValidatedUserId } from "../user";
import { ValidationError } from "../apigateway";

export const _configTypeTableName = process.env.CONFIG_TYPE_TABLE_NAME as string;
export const _belongsToGsiName = process.env.CONFIG_TYPE_BELONGS_TO_GSI_NAME as string;
export const _configDataBucketName = process.env.CONFIG_DATA_BUCKET_NAME as string;

export const _logger = getLogger("config-type");

export const MAX_ALLOWED_TAGS = 10;
export const CONFIG_NAME_VALUE_MAX_LENGTH = 15;
export const CONFIG_NAME_VALUE_MIN_LENGTH = 3;
export const CONFIG_DESCRIPTION_MAX_LENGTH = 400;

export enum ErrorMessage {
  INCORRECT_VALUE = "incorrect value",
  INCORRECT_FORMAT = "incorrect format",
  MISSING_VALUE = "missing value",
  LIMIT_EXCEEDED = "allowed items in list is exceeeded limit",
  DELETE_NOT_PERMITTED = "delete is not permitted",
}

export enum ConfigResourcePath {
  REQUEST = "request",
  BELONGS_TO = "belongsTo",
  STATUS = "status",
  NAME = "name",
  VALUE = "value",
  DESCRIPTION = "description",
  TAGS = "tags",
  ID = "id",
  COLOR = "color",
  COUNTRY = "country",
  CURRENCY = "currency",
}

export enum ConfigStatus {
  ENABLE = "enable",
  DISABLE = "disable",
  DELETED = "deleted",
}

export enum BelongsTo {
  PurchaseType = "purchase-type",
  PaymentAccountType = "pymt-account-type",
  CurrencyProfile = "currency-profile",
  IncomeType = "income-type",
  RefundReason = "refund-reason",
  InvestmentType = "investment-type",
  SharePerson = "share-person",
}

export const getBelongsToGsiPk = (event: APIGatewayProxyEvent | null, loggerBase: LoggerBase, userId?: string, belongsTo?: BelongsTo) => {
  const logger = getLogger("getBelongsToGsiPk", loggerBase);
  if (event) {
    userId = getValidatedUserId(event);
    belongsTo = getValidatedBelongsTo(event, logger);
  }
  return `userId#${userId}#belongsTo#${belongsTo}`;
};

export const getDetailsTablePk = (configId: string) => {
  return `configId#${configId}`;
};

export const getBelongsToGsiSk = (status: ConfigStatus) => {
  return `status#${status}`;
};

export const getValidatedBelongsTo = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("getValidatedBelongsTo", loggerBase);
  const belongsTo = event.pathParameters?.belongsTo;
  logger.info("path parameter, belongsTo =", belongsTo);

  if (!belongsTo) {
    throw new ValidationError([{ path: ConfigResourcePath.BELONGS_TO, message: ErrorMessage.MISSING_VALUE }]);
  }
  if (!isBelongsToValid(belongsTo)) {
    throw new ValidationError([{ path: ConfigResourcePath.BELONGS_TO, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return belongsTo as BelongsTo;
};

export const isBelongsToValid = (belongsTo: BelongsTo | string) => {
  return Object.values(BelongsTo).includes(belongsTo as BelongsTo);
  // return (
  //   BelongsTo.PaymentAccountType === belongsTo ||
  //   BelongsTo.CurrencyProfile === belongsTo ||
  //   BelongsTo.InvestmentType === belongsTo ||
  //   BelongsTo.PurchaseType === belongsTo ||
  //   BelongsTo.IncomeType === belongsTo ||
  //   BelongsTo.RefundReason === belongsTo
  // );
};

export const getValidatedConfigId = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("getValidatedBelongsTo", loggerBase);
  const configId = event.pathParameters?.configId;
  logger.info("path parameter, configId =", configId);

  if (!configId) {
    throw new ValidationError([{ path: ConfigResourcePath.ID, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (!validations.isValidUuid(configId)) {
    throw new ValidationError([{ path: ConfigResourcePath.ID, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return configId;
};
