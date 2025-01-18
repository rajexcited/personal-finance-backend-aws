import { APIGatewayProxyEvent } from "aws-lambda";
import { ValidationError } from "../../apigateway";
import { getLogger, validations, LoggerBase } from "../../utils";
import { ErrorMessage } from "./error";
import { ExpenseBelongsTo } from "../base-config";

enum PathParamResourcePath {
  ID = "id",
  BelongsTo = "belongsTo",
}

export const getValidatedExpenseIdPathParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("pathParam.getValidatedPurchaseId", _logger);
  const expenseId = event.pathParameters?.expenseId;
  logger.info("in pathparam, expenseId =", expenseId);

  if (!expenseId) {
    throw new ValidationError([{ path: PathParamResourcePath.ID, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (!validations.isValidUuid(expenseId)) {
    throw new ValidationError([{ path: PathParamResourcePath.ID, message: ErrorMessage.INCORRECT_FORMAT }]);
  }

  return expenseId;
};

export const getValidatedBelongsToPathParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("pathParam.getValidatedBelongsTo", _logger);
  const belongsTo = event.pathParameters?.belongsTo;
  logger.info("in pathparam, belongsTo =", belongsTo);

  if (!belongsTo) {
    throw new ValidationError([{ path: PathParamResourcePath.BelongsTo, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (!Object.values(ExpenseBelongsTo).includes(belongsTo as ExpenseBelongsTo)) {
    throw new ValidationError([{ path: PathParamResourcePath.BelongsTo, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return belongsTo as ExpenseBelongsTo;
};
