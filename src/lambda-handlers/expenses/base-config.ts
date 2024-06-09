import { APIGatewayProxyEvent } from "aws-lambda";
import { IllegelArgumentError, ValidationError } from "../apigateway";
import { getLogger, validations, dateutil, LoggerBase } from "../utils";

export const _expenseTableName = process.env.EXPENSES_TABLE_NAME as string;
export const _userIdStatusDateIndex = process.env.EXPENSE_USERID_DATE_GSI_NAME as string;
export const _expenseReceiptsBucketName = process.env.EXPENSE_RECEIPTS_BUCKET_NAME as string;
export const _receiptTempKeyPrefix = process.env.RECEIPT_TEMP_KEY_PREFIX as string;
export const _receiptKeyPrefix = process.env.RECEIPT_KEY_PREFIX as string;

export const _logger = getLogger("expenses");

export const GSI_ATTR_DATE_FORMAT = "YYYY-MM-DD";

export enum ErrorMessage {
  INCORRECT_VALUE = "incorrect value",
  INCORRECT_FORMAT = "incorrect format",
  MISSING_VALUE = "missing value",
  LIMIT_EXCEEDED = "allowed items in list is exceeeded limit",
  CANNOT_COMBINE_PAGE_COUNT_MONTHS = "not allowed both values of n page months and page count",
}

export enum ExpenseResourcePath {
  REQUEST = "request",
  PAGE_NO = "pageNo",
  STATUS = "status",
  DESCRIPTION = "description",
  TAGS = "tags",
  ID = "id",
  BILLNAME = "billName",
  AMOUNT = "amount",
  PURCHASE_DATE = "purchasedDate",
  VERIFIED_TIMESTAMP = "verifiedTimestamp",
  PAYMENT_ACCOUNT = "paymentAccount",
  EXPENSE_CATEGORY = "expenseCategoryId",
  RECEIPTS = "receipts",
  RECEIPT_ID = "receipts.id",
  RECEIPT_TYPE = "receipts.type",
  EXPENSE_ITEMS = "expenseItems",
  PAGE_MONTHS = "pageMonths",
  PAGE_COUNT = "pageCount",
}

export enum ExpenseStatus {
  ENABLE = "enable",
  DELETED = "deleted",
}

export enum FileExtension {
  JPG = "jpg",
  JPEG = "jpeg",
  PNG = "png",
  PDF = "pdf",
}

export const getDetailsTablePk = (expenseId: string) => {
  return `expenseId#${expenseId}#details`;
};

export const getItemsTablePk = (expenseId: string) => {
  return `expenseId#${expenseId}#items`;
};

export const getExpenseIdFromTablePk = (pk: string) => {
  const parts = pk.split("#");
  if (parts.length === 3 && parts[0] === "expenseId" && validations.isValidUuid(parts[1])) {
    return parts[1];
  }
  throw new IllegelArgumentError(`provided PK [${pk}] is not correct format`);
};

export const getYearMonthTablePk = (year: number, month: number) => {
  return `year#${year}#month#${month}`;
};

export const getUserIdStatusDateGsiPk = (userId: string, status: ExpenseStatus) => {
  return `userId#${userId}#status#${status}`;
};

export const getUserIdStatusDateGsiSk = (updatedOn: string | Date, _logger: LoggerBase) => {
  const logger = getLogger("getUserIdStatusDateGsiSk", _logger);
  const udate = getValidatedDateForGsiAttr(updatedOn, logger);
  if (udate) {
    return `updatedOn#${udate}`;
  }
  logger.debug("returning null");
  return null;
};

export const getUserIdStatusDateGsiAttribute1 = (purchaseDateOrCount: string | Date | number, _logger: LoggerBase) => {
  const logger = getLogger("getUserIdStatusDateGsiAttribute1", _logger);
  if (typeof purchaseDateOrCount === "number") {
    logger.debug("input param is count. value =", purchaseDateOrCount);
    return `count#${purchaseDateOrCount}`;
  }
  const pdate = getValidatedDateForGsiAttr(purchaseDateOrCount, logger);
  if (pdate) {
    return `purchaseDate#${pdate}`;
  }
  logger.debug("returning null");
  return null;
};

export const getCountFromAttr1 = (attrValue: string) => {
  const value = attrValue.replace("count#", "");
  const num = Number(value);
  if (isNaN(num)) {
    return null;
  }
  return num;
};

const getValidatedDateForGsiAttr = (date: string | Date | undefined | null, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedDateForGsiAttr", _logger);
  if (!date) return null;
  if (typeof date === "string" && validations.isValidDate(date, logger, GSI_ATTR_DATE_FORMAT)) {
    logger.debug("input param date =", date);
    return date;
  }

  if (validations.isValidDate(date, logger)) {
    const parseDate = typeof date === "string" ? dateutil.parseTimestamp(date as string) : (date as Date);
    const formatted = dateutil.formatTimestamp(parseDate, GSI_ATTR_DATE_FORMAT);
    logger.debug(
      "input param date =",
      date,
      " and typeof input date =",
      typeof date,
      ", parseDate =",
      parseDate,
      ", formatted attr date=",
      formatted
    );
    return formatted;
  }

  return null;
};

export const getValidatedExpenseIdFromPathParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedExpenseIdFromPathParam", _logger);
  const expenseId = event.pathParameters?.expenseId;
  logger.info("in pathparam, expenseId =", expenseId);

  if (!expenseId) {
    throw new ValidationError([{ path: ExpenseResourcePath.ID, message: ErrorMessage.MISSING_VALUE }]);
  }
  if (!validations.isValidUuid(expenseId)) {
    throw new ValidationError([{ path: ExpenseResourcePath.ID, message: ErrorMessage.INCORRECT_FORMAT }]);
  }
  return expenseId;
};

export const getReceiptPathkey = (receiptId: string, expenseId: string, userId: string) => {
  return [_receiptKeyPrefix, userId, expenseId, receiptId].join("/");
};
