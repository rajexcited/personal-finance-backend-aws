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
import { getAuthorizeUser, getValidatedUserId } from "../user";
import { ApiExpenseResource, DbItemExpense } from "./resource-type";
import * as datetime from "date-and-time";

const MONTHS_PER_PAGE = 3;

export const getExpenseList = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getExpenseList", _logger);
  const userId = getValidatedUserId(event);
  const pageNo = getValidatedPageNumber(event, logger);

  const dbExpenses = await getListOfDetails(userId, ExpenseStatus.ENABLE, pageNo, logger);
  const resourcePromises = dbExpenses.map(async (details) => {
    const auditDetails = await utils.parseAuditDetails(details.auditDetails, userId, getAuthorizeUser(event));

    logger.debug("userId", userId, "auditDetails", auditDetails);

    const resource: ApiExpenseResource = {
      id: details.id,
      billName: details.billName,
      amount: details.amount,
      expenseCategoryId: details.expenseCategoryId,
      purchasedDate: details.purchasedDate,
      verifiedTimestamp: details.verifiedTimestamp,
      paymentAccountId: details.paymentAccountId,
      receipts: details.receipts,
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

const getListOfDetails = async (userId: string, status: ExpenseStatus, pageNo: number, _logger: LoggerBase) => {
  const logger = getLogger("getListOfDetails", _logger);
  const expenseIds = await getListOfExpenseIds(userId, status, pageNo, logger);
  const itemKeys = [...expenseIds].map((id) => ({ PK: getDetailsTablePk(id) }));
  const items = await dbutil.batchGet<DbItemExpense>(itemKeys, _expenseTableName, logger);
  return items.map((item) => item.details);
};

const getListOfExpenseIds = async (userId: string, status: ExpenseStatus, pageNo: number, _logger: LoggerBase) => {
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
  const now = new Date();
  const searchEndDate = getEndDateAfterMonths(now, (1 - pageNo) * MONTHS_PER_PAGE, logger);
  const searchStartDate = getStartDateBeforeMonths(now, -1 * pageNo * MONTHS_PER_PAGE, logger);

  const itemsByUpdatedOn = await dbutil.queryAll<DbItemExpense>(logger, {
    TableName: _expenseTableName,
    IndexName: _userIdStatusDateIndex,
    KeyConditionExpression: "UD_GSI_PK = :gpkv and UD_GSI_SK BETWEEN :gskv1 and :gskv2",
    ExpressionAttributeValues: {
      ":gpkv": getUserIdStatusDateGsiPk(userId, status, false),
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
      ":gpkv": getUserIdStatusDateGsiPk(userId, status, false),
      ":gskv": getUserIdStatusDateGsiSk(searchStartDate, logger),
      ":gatt1v1": getUserIdStatusDateGsiAttribute1(searchStartDate, logger),
      ":gatt1v2": getUserIdStatusDateGsiAttribute1(searchEndDate, logger),
    },
  });

  const itemsofItems = await Promise.all([itemsByUpdatedOn, itemsByPurchaseDate]);

  const expenseIds = new Set<string>();
  itemsofItems
    .flatMap((it) => it)
    .filter((item) => typeof item.ExpiresAt !== "number")
    .forEach((item) => {
      expenseIds.add(getExpenseIdFromTablePk(item.PK));
    });

  logger.info("retrieved", expenseIds.size, "items for date range from [", searchStartDate, "] to [" + searchEndDate + "]");
  return expenseIds;
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

const getValidatedPageNumber = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedPageNumber", _logger);
  const pageNo = event.queryStringParameters?.pageNo;
  logger.info("query parameter, pageNo =", pageNo);

  if (!pageNo) {
    throw new ValidationError([{ path: ExpenseResourcePath.PAGE_NO, message: ErrorMessage.MISSING_VALUE }]);
  }

  return Number(pageNo);
};
