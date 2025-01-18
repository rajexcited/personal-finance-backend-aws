import { APIGatewayProxyEvent } from "aws-lambda/trigger/api-gateway-proxy";
import { apiGatewayHandlerWrapper, NotFoundError } from "../apigateway";
import { getAuthorizeUser } from "../user";
import { getValidatedBelongsToPathParam } from "./query-params";
import { getLogger } from "../utils";
import { ExpenseBelongsTo } from "../expenses/base-config";
import { purchaseStatsHandler } from "./purchase";
import { incomeStatsHandler } from "./income";
import { refundStatsHandler } from "./refund";

export const belongsToStats = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("belongsToStats.handler");
  const authUser = getAuthorizeUser(event);
  const belongsto = getValidatedBelongsToPathParam(event, logger);
  if (belongsto === ExpenseBelongsTo.Purchase) {
    return purchaseStatsHandler(event);
  }
  if (belongsto === ExpenseBelongsTo.Income) {
    return incomeStatsHandler(event);
  }
  if (belongsto === ExpenseBelongsTo.Refund) {
    return refundStatsHandler(event);
  }
  throw new NotFoundError("incorrect belongsTo.");
});
