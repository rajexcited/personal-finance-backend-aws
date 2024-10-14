import { APIGatewayProxyEvent } from "aws-lambda";
import { apiGatewayHandlerWrapper, JSONObject } from "../apigateway";
import { dbutil, getLogger, utils } from "../utils";
import { getAuthorizeUser } from "../user";
import { getValidatedYearParam } from "./query-params";
import { ExpenseBelongsTo } from "../expenses/base-config";
import { getConfigTypeList, getListOfPK, getPymtAccList } from "./db-config";
import { DbItemExpense, ExpenseTableName } from "../expenses/db-config";
import { DbDetailsPurchase } from "../expenses/purchase";
import { ApiStatsResourceExpense, StatBelongsTo } from "./resource-type";
import {
  getApiStatsResourceByConfigType,
  getApiStatsResourceByPymtAcc,
  getApiStatsResourceByTags,
  getApiStatsResourceByTypeTags,
  getApiStatsResourceDetails,
  groupDetailsMonthly,
} from "./base-config";

const rootLogger = getLogger("stats.purchase");

export const purchaseStats = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("handler", rootLogger);

  const authUser = getAuthorizeUser(event);
  const yearParam = getValidatedYearParam(event, logger);

  const purchasePkList = await getListOfPK(authUser.userId, yearParam, ExpenseBelongsTo.Purchase, logger);

  const detailsItemKeys = purchasePkList.map((pk) => ({ PK: pk }));
  const projectedExpression = "details.amount,details.purchaseTypeId,details.tags,details.personIds,details.purchaseDate";

  const reqAttrs: Partial<Record<"ProjectionExpression", string>> = { ProjectionExpression: projectedExpression };
  const detailsItemList = await dbutil.batchGet<DbItemExpense<DbDetailsPurchase>>(detailsItemKeys, ExpenseTableName, reqAttrs, logger);

  const purchaseTypeIdList = detailsItemList.map((itm) => itm.details.purchaseTypeId);
  const purchaseTypeDetailListPromise = getConfigTypeList(purchaseTypeIdList, logger);

  const personTagIdList = detailsItemList.flatMap((itm) => itm.details.personIds);
  const personTagDetailListPromise = getConfigTypeList(personTagIdList, logger);

  const pymtAccIdList = detailsItemList.map((itm) => itm.details.paymentAccountId || null);
  const pymtAccDetailListPromise = getPymtAccList(pymtAccIdList, logger);

  await Promise.all([purchaseTypeDetailListPromise, personTagDetailListPromise, pymtAccDetailListPromise]);

  const dbDetailsPurchaseList = detailsItemList.map((item) => item.details);
  const groupedMap = groupDetailsMonthly(dbDetailsPurchaseList, logger);

  const statsDetails = getApiStatsResourceDetails(groupedMap, yearParam, logger);

  const purchaseTypeValueGetter = (details: DbDetailsPurchase) => [details.purchaseTypeId];
  const statsByType = getApiStatsResourceByConfigType(groupedMap, await purchaseTypeDetailListPromise, yearParam, purchaseTypeValueGetter, logger);

  const statsByTags = getApiStatsResourceByTags(groupedMap, yearParam, logger);
  const statsByTypeTags = getApiStatsResourceByTypeTags(statsByType, await purchaseTypeDetailListPromise, yearParam, logger);

  const personIdValueGetter = (detail: DbDetailsPurchase) => detail.personIds;
  const statsByPersonId = getApiStatsResourceByConfigType(groupedMap, await personTagDetailListPromise, yearParam, personIdValueGetter, logger);

  const statsByPymtAcc = getApiStatsResourceByPymtAcc(groupedMap, await pymtAccDetailListPromise, yearParam, logger);

  const apiResource: ApiStatsResourceExpense = {
    year: yearParam,
    belongsTo: StatBelongsTo.Purchase,
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
