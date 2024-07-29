import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONArray, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import { LoggerBase, compareutil, dbutil, getLogger, utils, dateutil } from "../utils";
import {
  ErrorMessage,
  ExpenseResourcePath,
  ExpenseStatus,
  _expenseTableName,
  _logger,
  _userIdStatusDateIndex,
  getDetailsTablePk,
  getExpenseIdFromTablePk,
  getUserIdStatusDateGsiAttribute1,
  getUserIdStatusDateGsiPk,
  getUserIdStatusDateGsiSk,
} from "./base-config";
import { getAuthorizeUser } from "../user";
import { ApiExpenseResource, ApiReceiptResource, DbItemExpense } from "./resource-type";
import * as datetime from "date-and-time";

const MONTHS_PER_PAGE = 3;
const MAX_PAGE_SIZE_COUNT = 100;
const MAX_PAGE_SIZE_MONTHS = 12;

export const getExpenseCount = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getExpenseCount", _logger);
  const pageNoParam = getValidatedPageNumberPathParam(event, logger);
  const statusParam = getValidatedStatusPathParam(event, logger);
  const pageMonthsParam = getValidatedPageMonthsPathParam(event, statusParam, logger);

  const authUser = getAuthorizeUser(event);
  const maxPossibleDeletedCount = 999999;
  const expenseIds = await getListOfExpenseIds(authUser.userId, statusParam, pageNoParam, pageMonthsParam, maxPossibleDeletedCount, logger);

  return expenseIds.size;
});

export const getExpenseList = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getExpenseList", _logger);
  const pageNoParam = getValidatedPageNumberPathParam(event, logger);
  const statusParam = getValidatedStatusPathParam(event, logger);
  const pageMonthsParam = getValidatedPageMonthsPathParam(event, statusParam, logger);
  const pageCountParam = getValidatedPageCountPathParam(event, statusParam, logger);
  const authUser = getAuthorizeUser(event);

  const dbExpenses = await getListOfDetails(authUser.userId, statusParam, pageNoParam, pageMonthsParam, pageCountParam, logger);
  const resourcePromises = dbExpenses.map(async (details) => {
    const auditDetails = await utils.parseAuditDetails(details.auditDetails, authUser.userId, authUser);

    logger.debug("auditDetails", auditDetails);

    const apiReceipts = details.receipts.map((dbReceipt) => {
      const apiReceipt: ApiReceiptResource = {
        id: dbReceipt.id,
        name: dbReceipt.name,
        contentType: dbReceipt.contentType,
        size: dbReceipt.size,
      };
      return apiReceipt;
    });

    const resource: ApiExpenseResource = {
      id: details.id,
      billName: details.billName,
      amount: details.amount,
      expenseCategoryId: details.expenseCategoryId,
      purchasedDate: details.purchasedDate,
      verifiedTimestamp: details.verifiedTimestamp,
      paymentAccountId: details.paymentAccountId,
      receipts: apiReceipts,
      status: details.status,
      description: details.description,
      tags: details.tags,
      auditDetails: auditDetails,
    };
    return resource;
  });
  const resources = await Promise.all(resourcePromises);
  resources.sort(sortCompareFn);

  return resources as unknown as JSONArray;
});

const getListOfDetails = async (
  userId: string,
  status: ExpenseStatus,
  pageNo: number,
  pageMonths: number | null,
  pageCount: number | null,
  _logger: LoggerBase
) => {
  const logger = getLogger("getListOfDetails", _logger);
  const expenseIds = await getListOfExpenseIds(userId, status, pageNo, pageMonths, pageCount, logger);
  const itemKeys = [...expenseIds].map((id) => ({ PK: getDetailsTablePk(id) }));
  const items = await dbutil.batchGet<DbItemExpense>(itemKeys, _expenseTableName, logger);
  return items.map((item) => item.details);
};

const getListOfExpenseIds = async (
  userId: string,
  status: ExpenseStatus,
  pageNo: number,
  pageMonths: number | null,
  pageCount: number | null,
  _logger: LoggerBase
) => {
  const logger = getLogger("getListOfExpenseIds", _logger);

  /**
   * search term will be by month range
   * page 1: last 3 months
   *    for example, today is 4/23/2024
   *      start search date of 3 months ago, is 1/23/2024
   *      flooring month date of it is 1/1/2024
   *      so date range is 1/1/2024 to 4/23/2024
   *
   * page 2: last 3-6 months
   *    for example, today is 4/23/2024
   *      end search date of 3 months ago, is 1/23/2024
   *      ceiling month date of it is 1/31/2024
   *      start search date of 6 months ago, is 10/23/2023
   *      flooring month date of it is 10/1/2023
   *      so date range is
   *
   */
  let expenseItems: DbItemExpense[] = [];
  if (pageMonths && status === ExpenseStatus.ENABLE) {
    expenseItems = await getListByPageMonths(userId, status, pageNo, pageMonths, logger);
  }
  if (pageCount && status === ExpenseStatus.DELETED) {
    expenseItems = await getListByPageCount(userId, status, pageNo, pageCount, logger);
  }

  // const isDeleted = (item:DbItemExpense) => (status === ExpenseStatus.DELETED && typeof item.ExpiresAt === "number" && item.ExpiresAt)
  // const isNotDeleted = (item:DbItemExpense) => (status !== ExpenseStatus.DELETED && !item.ExpiresAt && typeof item.ExpiresAt !== "number")

  const expenseIds = new Set<string>();
  expenseItems
    // .filter((item) => (isDeleted(item) ||  isNotDeleted(item)))
    .forEach((item) => {
      expenseIds.add(getExpenseIdFromTablePk(item.PK));
    });

  return expenseIds;
};

const getListByPageMonths = async (userId: string, status: ExpenseStatus, pageNo: number, pageMonths: number, _logger: LoggerBase) => {
  const logger = getLogger("getListByPageMonths", _logger);

  const now = new Date();
  const searchEndDate = getEndDateAfterMonths(now, (1 - pageNo) * pageMonths, logger);
  const searchStartDate = getStartDateBeforeMonths(now, -1 * pageNo * pageMonths, logger);

  const itemsByUpdatedOn = await dbutil.queryAll<DbItemExpense>(logger, {
    TableName: _expenseTableName,
    IndexName: _userIdStatusDateIndex,
    KeyConditionExpression: "UD_GSI_PK = :gpkv and UD_GSI_SK BETWEEN :gskv1 and :gskv2",
    ExpressionAttributeValues: {
      ":gpkv": getUserIdStatusDateGsiPk(userId, status),
      ":gskv1": getUserIdStatusDateGsiSk(searchStartDate, logger),
      ":gskv2": getUserIdStatusDateGsiSk(searchEndDate, logger),
    },
  });

  const itemsByPurchaseDate = await dbutil.queryAll<DbItemExpense>(logger, {
    TableName: _expenseTableName,
    IndexName: _userIdStatusDateIndex,
    KeyConditionExpression: "UD_GSI_PK = :gpkv and UD_GSI_SK >= :gskv",
    FilterExpression: "UD_GSI_ATTR1 BETWEEN :gatt1v1 and :gatt1v2",
    ExpressionAttributeValues: {
      ":gpkv": getUserIdStatusDateGsiPk(userId, status),
      ":gskv": getUserIdStatusDateGsiSk(searchStartDate, logger),
      ":gatt1v1": getUserIdStatusDateGsiAttribute1(searchStartDate, logger),
      ":gatt1v2": getUserIdStatusDateGsiAttribute1(searchEndDate, logger),
    },
  });

  const itemsofItems = await Promise.all([itemsByUpdatedOn, itemsByPurchaseDate]);
  const items = itemsofItems.flatMap((it) => it);

  logger.info("retrieved", items.length, "items of status [", status, "] for date range from [", searchStartDate, "] to [" + searchEndDate + "]");
  return items;
};

const getListByPageCount = async (userId: string, status: ExpenseStatus, pageNo: number, pageCount: number, _logger: LoggerBase) => {
  const logger = getLogger("getListByPageMonths", _logger);

  const startNum = (pageNo - 1) * pageCount;
  const endNum = pageNo * pageCount;
  const now = new Date();
  const searchStartDate = getStartDateBeforeMonths(now, -12, logger);

  const itemsByUpdatedOn = await dbutil.queryAll<DbItemExpense>(logger, {
    TableName: _expenseTableName,
    IndexName: _userIdStatusDateIndex,
    KeyConditionExpression: "UD_GSI_PK = :gpkv and UD_GSI_SK > :gskv",
    ExpressionAttributeValues: {
      ":gpkv": getUserIdStatusDateGsiPk(userId, status),
      ":gskv": getUserIdStatusDateGsiSk(searchStartDate, logger),
    },
  });

  const items = await Promise.all(itemsByUpdatedOn);

  logger.info("retrieved", items.length, "items of status [", status, "] with startDate [", searchStartDate, "]");
  return items.slice(startNum, endNum);
};

const getStartDateBeforeMonths = (date: Date, months: number, logger?: LoggerBase) => {
  // if possible do round of date and include extra month to search if required.
  // for example, for date of April 1st, best to include extra previous month
  const startDate = dateutil.getMonthStartDate(date, null, logger);
  const newDate = datetime.addMonths(startDate as Date, months + 1);
  return newDate;
};

const getEndDateAfterMonths = (date: Date, months: number, logger?: LoggerBase) => {
  const newDate = datetime.addMonths(date, months);
  const endDate = dateutil.getMonthEndDate(newDate, null, logger);
  return endDate as Date;
};

const sortCompareFn = (item1: ApiExpenseResource, item2: ApiExpenseResource) => {
  /**
   * priority 1 => by updatedOn
   * priority 3 => by purchaseDate
   * priority 2 => by createdOn
   * priority 3 => by billName
   */
  const updatedOnCompareResult = compareutil.compareUpdatedOn(item1.auditDetails, item2.auditDetails);
  if (updatedOnCompareResult !== 0) return updatedOnCompareResult;

  const purchaseDateCompareResult = item1.purchasedDate.localeCompare(item2.purchasedDate);
  if (purchaseDateCompareResult !== 0) return purchaseDateCompareResult;

  const createdOnCompareResult = compareutil.compareCreatedOn(item1.auditDetails, item2.auditDetails);
  if (createdOnCompareResult !== 0) return createdOnCompareResult;

  const billnameCompareResult = item1.billName.localeCompare(item2.billName);
  if (billnameCompareResult !== 0) return billnameCompareResult;

  return 0;
};

const getValidatedPageNumberPathParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedPageNumber", _logger);
  const pageNo = event.queryStringParameters?.pageNo;
  logger.info("query parameter, pageNo =", pageNo);

  if (!pageNo) {
    throw new ValidationError([{ path: ExpenseResourcePath.PAGE_NO, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (isNaN(Number(pageNo))) {
    throw new ValidationError([{ path: ExpenseResourcePath.PAGE_NO, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return Number(pageNo);
};

const getValidatedStatusPathParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedStatus", _logger);
  const status = event.queryStringParameters?.status;
  logger.info("query parameter, status =", status);

  if (status && status !== ExpenseStatus.DELETED && status !== ExpenseStatus.ENABLE) {
    throw new ValidationError([{ path: ExpenseResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  if (!status) {
    return ExpenseStatus.ENABLE;
  }
  return status as ExpenseStatus;
};

const getValidatedPageMonthsPathParam = (event: APIGatewayProxyEvent, status: ExpenseStatus, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedPageMonths", _logger);
  const pageMonths = event.queryStringParameters?.pageMonths;
  const pageCount = event.queryStringParameters?.pageCount;
  logger.info("query parameter, pageMonths =", pageMonths, ", pageCount =", pageCount);

  if (pageMonths && pageCount && !isNaN(Number(pageMonths)) && !isNaN(Number(pageCount))) {
    throw new ValidationError([
      { path: ExpenseResourcePath.PAGE_MONTHS, message: ErrorMessage.CANNOT_COMBINE_PAGE_COUNT_MONTHS },
      { path: ExpenseResourcePath.PAGE_COUNT, message: ErrorMessage.CANNOT_COMBINE_PAGE_COUNT_MONTHS },
    ]);
  }
  const pageMonthsNum = Number(pageMonths);
  if (pageMonths && isNaN(pageMonthsNum)) {
    throw new ValidationError([{ path: ExpenseResourcePath.PAGE_MONTHS, message: ErrorMessage.INCORRECT_VALUE }]);
  }
  if (!pageMonths && !pageCount && status === ExpenseStatus.ENABLE) {
    return MONTHS_PER_PAGE;
  }
  if (!pageMonths && (pageCount || status === ExpenseStatus.DELETED)) {
    return null;
  }
  if (pageMonthsNum > MAX_PAGE_SIZE_MONTHS) {
    throw new ValidationError([{ path: ExpenseResourcePath.PAGE_MONTHS, message: ErrorMessage.LIMIT_EXCEEDED }]);
  }
  return pageMonthsNum;
};

const getValidatedPageCountPathParam = (event: APIGatewayProxyEvent, status: ExpenseStatus, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedPageCount", _logger);
  const pageMonths = event.queryStringParameters?.pageMonths;
  const pageCount = event.queryStringParameters?.pageCount;
  logger.info("query parameter, pageMonths =", pageMonths, ", pageCount =", pageCount);

  if (pageMonths && pageCount && !isNaN(Number(pageMonths)) && !isNaN(Number(pageCount))) {
    throw new ValidationError([
      { path: ExpenseResourcePath.PAGE_MONTHS, message: ErrorMessage.CANNOT_COMBINE_PAGE_COUNT_MONTHS },
      { path: ExpenseResourcePath.PAGE_COUNT, message: ErrorMessage.CANNOT_COMBINE_PAGE_COUNT_MONTHS },
    ]);
  }
  const pageCountNum = Number(pageCount);
  if (pageCount && isNaN(pageCountNum)) {
    throw new ValidationError([{ path: ExpenseResourcePath.PAGE_COUNT, message: ErrorMessage.INCORRECT_VALUE }]);
  }
  if (!pageCount) {
    return status === ExpenseStatus.DELETED ? MAX_PAGE_SIZE_COUNT : null;
  }
  if (pageCountNum > MAX_PAGE_SIZE_COUNT) {
    throw new ValidationError([{ path: ExpenseResourcePath.PAGE_COUNT, message: ErrorMessage.LIMIT_EXCEEDED }]);
  }
  return pageCountNum;
};
