import { APIGatewayProxyEvent } from "aws-lambda";
import { apiGatewayHandlerWrapper, JSONObject } from "../apigateway";
import { dbutil, getLogger, utils } from "../utils";
import { getAuthorizeUser } from "../user";
import { getValidatedYearParam } from "./query-params";
import { ExpenseBelongsTo } from "../expenses/base-config";
import { getListOfPK, getConfigTypeList, getPymtAccList, DbItemProjectedRefund, refundProjectedExpression } from "./db-config";
import { ExpenseTableName } from "../expenses/db-config";
import { ApiStatsResourceExpense, StatBelongsTo } from "./resource-type";
import {
  getApiStatsResourceByConfigType,
  getApiStatsResourceByPymtAcc,
  getApiStatsResourceByTags,
  getApiStatsResourceByTypeTags,
  getApiStatsResourceDetails,
  groupDetailsMonthly
} from "./base-config";

const rootLogger = getLogger("stats.refund");

export const refundStatsHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("handler", rootLogger);

  const authUser = getAuthorizeUser(event);
  const yearParam = getValidatedYearParam(event, logger);

  const refundPkList = await getListOfPK(authUser.userId, yearParam, ExpenseBelongsTo.Refund, logger);
  const detailsItemKeys = refundPkList.map((pk) => ({ PK: pk }));

  const reqAttrs = { ProjectionExpression: refundProjectedExpression };
  const detailsItemList = await dbutil.batchGet<DbItemProjectedRefund>(detailsItemKeys, ExpenseTableName, reqAttrs, logger);

  const reasonIdList = detailsItemList.map((itm) => itm.details.reasonId);
  const reasonDetailListPromise = getConfigTypeList(reasonIdList, logger);

  const personTagIdList = detailsItemList.flatMap((itm) => itm.details.personIds);
  const personTagDetailListPromise = getConfigTypeList(personTagIdList, logger);

  const pymtAccIdList = detailsItemList.map((itm) => itm.details.paymentAccountId);
  const pymtAccDetailListPromise = getPymtAccList(pymtAccIdList, logger);

  await Promise.all([reasonDetailListPromise, personTagDetailListPromise]);

  const groupedMap = groupDetailsMonthly(detailsItemList, logger);

  const statsDetails = getApiStatsResourceDetails(groupedMap, yearParam, logger);

  const reasonValueGetter = (item: DbItemProjectedRefund) => [item.details.reasonId];
  const statsByType = getApiStatsResourceByConfigType(groupedMap, await reasonDetailListPromise, yearParam, reasonValueGetter, logger);

  const statsByTags = getApiStatsResourceByTags(groupedMap, yearParam, logger);

  const statsByTypeTags = getApiStatsResourceByTypeTags(statsByType, await reasonDetailListPromise, yearParam, logger);

  const personIdValueGetter = (item: DbItemProjectedRefund) => item.details.personIds;
  const statsByPersonId = getApiStatsResourceByConfigType(groupedMap, await personTagDetailListPromise, yearParam, personIdValueGetter, logger);

  const statsByPymtAcc = getApiStatsResourceByPymtAcc(groupedMap, await pymtAccDetailListPromise, yearParam, logger);

  const apiResource: ApiStatsResourceExpense = {
    year: yearParam,
    belongsTo: StatBelongsTo.Refund,
    details: statsDetails,
    byType: statsByType,
    byTags: statsByTags,
    byTypeTags: statsByTypeTags,
    byPersonTags: statsByPersonId,
    byPymtAcc: statsByPymtAcc,
    auditDetails: await utils.parseAuditDetails({ createdOn: "", updatedOn: "" }, authUser.userId, authUser)
  };

  return apiResource as unknown as JSONObject;
};

export const refundStats = apiGatewayHandlerWrapper(refundStatsHandler);
