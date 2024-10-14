import { APIGatewayProxyEvent } from "aws-lambda";
import { apiGatewayHandlerWrapper, JSONObject } from "../apigateway";
import { dbutil, getLogger, utils } from "../utils";
import { getAuthorizeUser } from "../user";
import { getValidatedYearParam } from "./query-params";
import { ExpenseBelongsTo } from "../expenses/base-config";
import { getConfigTypeList, getListOfPK, getPymtAccList, PartialConfigType } from "./db-config";
import { DbItemExpense, ExpenseTableName } from "../expenses/db-config";
import { ApiStatsResourceExpense, StatBelongsTo } from "./resource-type";
import {
  getApiStatsResourceByConfigType,
  getApiStatsResourceByPymtAcc,
  getApiStatsResourceByTags,
  getApiStatsResourceByTypeTags,
  getApiStatsResourceDetails,
  groupDetailsMonthly,
} from "./base-config";
import { DbDetailsIncome } from "../expenses/income";

const rootLogger = getLogger("stats.income");

export const incomeStats = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("handler", rootLogger);

  const authUser = getAuthorizeUser(event);
  const yearParam = getValidatedYearParam(event, logger);

  const incomePkList = await getListOfPK(authUser.userId, yearParam, ExpenseBelongsTo.Income, logger);
  const detailsItemKeys = incomePkList.map((pk) => ({ PK: pk }));
  const projectedExpression = "details.amount,details.incomeTypeId,details.tags,details.personIds,details.incomeDate";

  const reqAttrs: Partial<Record<"ProjectionExpression", string>> = { ProjectionExpression: projectedExpression };
  const detailsItemList = await dbutil.batchGet<DbItemExpense<DbDetailsIncome>>(detailsItemKeys, ExpenseTableName, reqAttrs, logger);

  const incomeTypIds = detailsItemList.map((itm) => itm.details.incomeTypeId);
  const incomeTypDetailListPromise = getConfigTypeList(incomeTypIds, logger);

  const personTagIds = detailsItemList.flatMap((itm) => itm.details.personIds);
  const personTagDetailListPromise = getConfigTypeList(personTagIds, logger);

  const pymtAccIds = detailsItemList.map((itm) => itm.details.paymentAccountId || null);
  const pymtAccDetailListPromise = getPymtAccList(pymtAccIds, logger);

  await Promise.all([incomeTypDetailListPromise, personTagDetailListPromise]);

  const dbDetailsIncomeList = detailsItemList.map((item) => item.details);
  const groupedMap = groupDetailsMonthly(dbDetailsIncomeList, logger);

  const statsDetails = getApiStatsResourceDetails(groupedMap, yearParam, logger);

  const reasonValueGetter = (details: DbDetailsIncome) => [details.incomeTypeId];
  const statsByType = getApiStatsResourceByConfigType(groupedMap, await incomeTypDetailListPromise, yearParam, reasonValueGetter, logger);

  const statsByTags = getApiStatsResourceByTags(groupedMap, yearParam, logger);
  const statsByTypeTags = getApiStatsResourceByTypeTags(statsByType, await incomeTypDetailListPromise, yearParam, logger);

  const personIdValueGetter = (detail: DbDetailsIncome) => detail.personIds;
  const statsByPersonId = getApiStatsResourceByConfigType(groupedMap, await personTagDetailListPromise, yearParam, personIdValueGetter, logger);

  const statsByPymtAcc = getApiStatsResourceByPymtAcc(groupedMap, await pymtAccDetailListPromise, yearParam, logger);

  const apiResource: ApiStatsResourceExpense = {
    year: yearParam,
    belongsTo: StatBelongsTo.Income,
    details: statsDetails,
    byType: statsByType,
    byTags: statsByTags,
    byTypeTags: statsByTypeTags,
    byPersonTags: statsByPersonId,
    byPymtAcc: statsByPymtAcc,
    auditDetails: await utils.parseAuditDetails({ createdOn: "", updatedOn: "" }, authUser.userId, authUser),
  };

  return apiResource as unknown as JSONObject;
});
