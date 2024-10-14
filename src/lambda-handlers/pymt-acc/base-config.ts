import { APIGatewayProxyEvent } from "aws-lambda";
import { LoggerBase, getLogger, validations } from "../utils";
import { ValidationError } from "../apigateway";

export const _pymtAccTableName = process.env.PAYMENT_ACCOUNT_TABLE_NAME as string;
export const _userIdStatusShortnameIndex = process.env.PAYMENT_ACCOUNT_USERID_GSI_NAME as string;
export const _logger = getLogger("pymt-acc");

export const SHORTNAME_MAX_LENGTH = 20;
export const ACCOUNT_ID_NUM_MAX_LENGTH = 25;
export const INSTITUTION_NAME_MAX_LENGTH = 25;
export const NAME_MIN_LENGTH = 2;

export enum ErrorMessage {
  INCORRECT_VALUE = "incorrect value",
  INCORRECT_FORMAT = "incorrect format",
  MISSING_VALUE = "missing value",
  LIMIT_EXCEEDED = "allowed items in list is exceeeded limit",
  DUPLICATE_VALUE = "duplicate value is not allowed",
}

export enum PymtAccResourcePath {
  REQUEST = "request",
  STATUS = "status",
  DESCRIPTION = "description",
  TAGS = "tags",
  ID = "id",
  SHORTNAME = "shortName",
  ACCOUNT_ID_NAME = "accountIdNum",
  INSTITUTION_NAME = "institutionName",
  TYPE_ID = "typeId",
  PAGE_NO = "pageNo",
  PAGE_COUNT = "pageCount",
}

export enum PymtAccStatus {
  ENABLE = "enable",
  DELETED = "deleted",
  Immutable = "immutable",
}

export const getDetailsTablePk = (paymentAccountId: string) => {
  return `pymtAccId#${paymentAccountId}`;
};

export const getUserIdStatusShortnameGsiPk = (userId: string, status: PymtAccStatus) => {
  if (status === PymtAccStatus.Immutable) {
    return `userId#${userId}#status#${PymtAccStatus.ENABLE}`;
  }
  return `userId#${userId}#status#${status}`;
};

export const getUserIdStatusShortnameGsiSk = (shortName: string) => {
  return `shortName#${shortName}`;
};

export const getValidatedPymtAccId = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("getValidatedPymtAccId", loggerBase);
  const pymtAccId = event.pathParameters?.pymtAccId;
  logger.info("path parameter, pymtAccId =", pymtAccId);

  if (!pymtAccId) {
    throw new ValidationError([{ path: PymtAccResourcePath.ID, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (!validations.isValidUuid(pymtAccId)) {
    throw new ValidationError([{ path: PymtAccResourcePath.ID, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return pymtAccId;
};
