import { getLogger } from "../utils";

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
}

export enum PymtAccStatus {
  ENABLE = "enable",
  DELETED = "deleted",
}

export const getDetailsTablePk = (paymentAccountId: string) => {
  return `pymtAccId#${paymentAccountId}`;
};

export const getUserIdStatusShortnameGsiPk = (userId: string, status?: PymtAccStatus) => {
  if (status) {
    return `userId#${userId}#status#${status}`;
  }
  return `userId#${userId}#status`;
};

export const getUserIdStatusShortnameGsiSk = (shortName: string) => {
  const spaceReplacer = "`";
  const regex = new RegExp("\\s", "g");

  return `shortname#${shortName.replace(regex, spaceReplacer)}`;
};
