import { APIGatewayProxyEvent } from "aws-lambda";
import { apiGatewayHandlerWrapper } from "../apigateway";
import { dbutil, getLogger } from "../utils";
import { getAuthorizeUser } from "../user";
import {
  getValidatedBelongsToQueryParam,
  getValidatedPageMonthsQueryParam,
  getValidatedPageNumberQueryParam,
  getValidatedStatusQueryParam
} from "./api-resource/query-param";
import { getEndDateAfterMonths, getStartDateBeforeMonths } from "./base-config";
import { ExpenseTableName, getGsiAttrDetailsBelongsTo, getGsiPkDetails, getGsiSkDetailsExpenseDate, UserIdStatusIndex } from "./db-config";
import { Select } from "@aws-sdk/client-dynamodb";
import { getDefaultCurrencyProfile } from "../config-type";

const rootLogger = getLogger("expenses.get-count");
export const getExpenseCount = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getExpenseCount", rootLogger);

  const pageNoParam = getValidatedPageNumberQueryParam(event, logger);
  const statusParam = getValidatedStatusQueryParam(event, logger);
  const pageMonthsParam = getValidatedPageMonthsQueryParam(event, logger);
  const belongsToParam = getValidatedBelongsToQueryParam(event, logger);

  const authUser = getAuthorizeUser(event);

  const currencyProfile = await getDefaultCurrencyProfile(authUser.userId, logger);
  const now = new Date();
  const searchEndDate = getEndDateAfterMonths(now, (1 - pageNoParam) * pageMonthsParam, logger);
  const searchStartDate = getStartDateBeforeMonths(now, -1 * pageNoParam * pageMonthsParam, logger);

  const belongsToAttrVal = belongsToParam ? { ":gbtv": getGsiAttrDetailsBelongsTo(belongsToParam, logger) } : {};
  const result = await dbutil.queryOnce(
    {
      TableName: ExpenseTableName,
      IndexName: UserIdStatusIndex,
      KeyConditionExpression: "US_GSI_PK = :gpkv and US_GSI_SK BETWEEN :gskv1 and :gskv2",
      FilterExpression: belongsToParam ? "US_GSI_BELONGSTO = :gbtv" : undefined,
      ExpressionAttributeValues: {
        ":gpkv": getGsiPkDetails(authUser.userId, statusParam, currencyProfile, logger),
        ":gskv1": getGsiSkDetailsExpenseDate(searchStartDate, logger),
        ":gskv2": getGsiSkDetailsExpenseDate(searchEndDate, logger),
        ...belongsToAttrVal
      },
      Select: Select.COUNT
    },
    logger,
    dbutil.CacheAction.CLEAR_CACHE_AFTER_RESULT
  );

  return result?.Count || 0;
});
