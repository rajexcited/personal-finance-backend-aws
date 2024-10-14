import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONArray, apiGatewayHandlerWrapper } from "../apigateway";
import { LoggerBase, compareutil, dbutil, getLogger } from "../utils";
import { getAuthorizeUser } from "../user";
import {
  getValidatedBelongsToQueryParam,
  getValidatedPageMonthsQueryParam,
  getValidatedPageNumberQueryParam,
  getValidatedStatusQueryParam,
} from "./api-resource/query-param";
import { ExpenseBelongsTo, ExpenseStatus, getEndDateAfterMonths, getStartDateBeforeMonths } from "./base-config";
import {
  DbItemExpense,
  ExpenseTableName,
  getGsiAttrDetailsBelongsTo,
  getGsiPkDetails,
  getGsiSkDetailsExpenseDate,
  UserIdStatusIndex,
} from "./db-config";
import { convertPurchaseDbToApiResource, ApiResourcePurchaseDetails, DbDetailsPurchase } from "./purchase";
import { DbDetailsIncome, ApiResourceIncomeDetails, convertIncomeDbToApiResource } from "./income";
import { DbDetailsRefund, ApiResourceRefundDetails, convertRefundDbToApiResource } from "./refund";
import { DbDetailsInvestment, ApiResourceInvestmentDetails, convertInvestmentDbToApiResource } from "./investment";

const rootLogger = getLogger("expenses.get-list");
type DbDetailsExpense = DbDetailsPurchase | DbDetailsRefund | DbDetailsIncome | DbDetailsInvestment;

export const getExpenseList = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getExpenseList", rootLogger);

  const pageNoParam = getValidatedPageNumberQueryParam(event, logger);
  const statusParam = getValidatedStatusQueryParam(event, logger);
  const pageMonthsParam = getValidatedPageMonthsQueryParam(event, logger);
  const belongsToParam = getValidatedBelongsToQueryParam(event, logger);

  const authUser = getAuthorizeUser(event);

  const expenseDetailPKList = await getListOfPK(authUser.userId, statusParam, pageNoParam, pageMonthsParam, belongsToParam, logger);
  const detailsItemKeys = expenseDetailPKList.map((pk) => ({ PK: pk }));
  const detailsItemList = await dbutil.batchGet<DbItemExpense<DbDetailsExpense>>(detailsItemKeys, ExpenseTableName, {}, logger);
  const dbDetailsExpenseList = detailsItemList.map((item) => item.details);

  const resourcePromises = dbDetailsExpenseList.map(async (details) => {
    if (details.belongsTo === ExpenseBelongsTo.Purchase) {
      return convertPurchaseDbToApiResource(details, null, authUser, logger);
    }
    if (details.belongsTo === ExpenseBelongsTo.Refund) {
      return convertRefundDbToApiResource(details, authUser, logger);
    }
    if (details.belongsTo === ExpenseBelongsTo.Income) {
      return convertIncomeDbToApiResource(details, authUser, logger);
    }
    if (details.belongsTo === ExpenseBelongsTo.Investment) {
      return convertInvestmentDbToApiResource(details, authUser, logger);
    }
    return null;
  });
  const resourceList = await Promise.all(resourcePromises);
  const nonNullResources = resourceList.filter((rsc) => rsc !== null).map((rsc) => rsc as ApiResourceExpense);

  return nonNullResources.sort(sortCompareFn) as unknown as JSONArray;
});

const getListOfPK = async (
  userId: string,
  status: ExpenseStatus,
  pageNo: number,
  pageMonths: number,
  belongsTo: ExpenseBelongsTo | null,
  _logger: LoggerBase
) => {
  const logger = getLogger("getListOfPK", _logger);

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
  const searchEndDate = getEndDateAfterMonths(now, (1 - pageNo) * pageMonths, logger);
  const searchStartDate = getStartDateBeforeMonths(now, -1 * pageNo * pageMonths, logger);

  const belongsToAttrVal = belongsTo ? { ":gbtv": getGsiAttrDetailsBelongsTo(belongsTo, logger) } : {};
  const items = await dbutil.queryAll<DbItemExpense<null>>(logger, {
    TableName: ExpenseTableName,
    IndexName: UserIdStatusIndex,
    KeyConditionExpression: "US_GSI_PK = :gpkv and US_GSI_SK BETWEEN :gskv1 and :gskv2",
    FilterExpression: belongsTo ? "US_GSI_BELONGSTO = :gbtv" : undefined,
    ExpressionAttributeValues: {
      ":gpkv": getGsiPkDetails(userId, status, logger),
      ":gskv1": getGsiSkDetailsExpenseDate(searchStartDate, logger),
      ":gskv2": getGsiSkDetailsExpenseDate(searchEndDate, logger),
      ...belongsToAttrVal,
    },
  });

  logger.info(
    "retrieved",
    items.length,
    "items with filter criteria, status =",
    status,
    " searchStartDate =",
    searchStartDate,
    " searchEndDate =",
    searchEndDate,
    " pageNo =",
    pageNo,
    " pageMonths =",
    pageMonths,
    " belongsTo =",
    belongsTo
  );

  return items.map((xpnsItm) => xpnsItm.PK);
};

type ApiResourceExpense = ApiResourcePurchaseDetails | ApiResourceRefundDetails | ApiResourceIncomeDetails | ApiResourceInvestmentDetails;
const sortCompareFn = (item1: ApiResourceExpense, item2: ApiResourceExpense) => {
  /**
   * priority 1 => by expenseDate
   * priority 2 => by billName
   * priority 3 => by updatedOn
   */
  const expenseDateCompareResult = getExpenseDate(item1).localeCompare(getExpenseDate(item2));
  if (expenseDateCompareResult !== 0) return expenseDateCompareResult;

  const billnameCompareResult = item1.billName.localeCompare(item2.billName);
  if (billnameCompareResult !== 0) return billnameCompareResult;

  const updatedOnCompareResult = compareutil.compareUpdatedOn(item1.auditDetails, item2.auditDetails);
  if (updatedOnCompareResult !== 0) return updatedOnCompareResult;

  return 0;
};

const getExpenseDate = (item: ApiResourceExpense) => {
  if (item.belongsTo === ExpenseBelongsTo.Purchase) {
    return item.purchaseDate;
  }
  if (item.belongsTo === ExpenseBelongsTo.Refund) {
    return item.refundDate;
  }
  if (item.belongsTo === ExpenseBelongsTo.Income) {
    return item.incomeDate;
  }
  if (item.belongsTo === ExpenseBelongsTo.Investment) {
    return item.investmentDate;
  }
  return "";
};
