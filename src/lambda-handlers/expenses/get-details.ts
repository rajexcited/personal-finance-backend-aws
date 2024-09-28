import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONObject, NotFoundError, UnAuthorizedError, apiGatewayHandlerWrapper } from "../apigateway";
import { getLogger, LoggerBase } from "../utils";
import { getAuthorizeUser } from "../user";
import { DbDetailsType, DbItemExpense } from "./db-config";
import { getValidatedBelongsToPathParam, getValidatedExpenseIdPathParam } from "./api-resource";
import { validateExpenseAuthorization } from "./db-config/details";
import { retrieveDbPurchaseToApiResource } from "./purchase";
import { ExpenseBelongsTo } from "./base-config";
import { retrieveDbIncomeToApiResource } from "./income";
import { retrieveDbRefundToApiResource } from "./refund";

const rootLogger = getLogger("expense.get-details");

export const getExpenseDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("handler", rootLogger);

  const authUser = getAuthorizeUser(event);
  const expenseId = getValidatedExpenseIdPathParam(event, logger);
  const belongsToParam = getValidatedBelongsToPathParam(event, logger);

  let apiResourceExpense, dbDetails;
  if (belongsToParam === ExpenseBelongsTo.Purchase) {
    const result = await retrieveDbPurchaseToApiResource(expenseId, authUser, logger);
    apiResourceExpense = result.apiResource;
    dbDetails = result.expenseDetails;
  } else if (belongsToParam === ExpenseBelongsTo.Income) {
    const result = await retrieveDbIncomeToApiResource(expenseId, authUser, logger);
    apiResourceExpense = result.apiResource;
    dbDetails = result.expenseDetails;
  } else if (belongsToParam === ExpenseBelongsTo.Refund) {
    const result = await retrieveDbRefundToApiResource(expenseId, authUser, logger);
    apiResourceExpense = result.apiResource;
    dbDetails = result.expenseDetails;
  }

  if (!dbDetails) {
    throw new NotFoundError("expense details not found in db");
  }
  if (!apiResourceExpense) {
    throw new NotFoundError("api resource not found");
  }
  validateDeletedExpense(dbDetails, logger);

  validateExpenseAuthorization(dbDetails, authUser, logger);

  return apiResourceExpense as unknown as JSONObject;
});

const validateDeletedExpense = async (expenseDetails: DbItemExpense<DbDetailsType>, logger: LoggerBase) => {
  if (expenseDetails.ExpiresAt !== undefined) {
    logger.warn("expense is mark for deletion. ExpiresAt =", expenseDetails.ExpiresAt);
    throw new UnAuthorizedError("expense is deleted");
  }
};
