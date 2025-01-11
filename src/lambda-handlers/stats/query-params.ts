import { APIGatewayProxyEvent } from "aws-lambda";
import { getLogger, LoggerBase } from "../utils";
import { ValidationError } from "../apigateway";
import { ExpenseBelongsTo } from "../expenses/base-config";

enum ErrorMessage {
  INCORRECT_VALUE = "incorrect value",
  MISSING_VALUE = "missing value"
}

enum ResourcePath {
  YEAR = "year",
  BelongsTo = "belongsTo"
}

export const getValidatedYearParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("queryParam.getValidatedYear", _logger);
  const year = event.queryStringParameters?.year;

  if (!year) {
    return new Date().getFullYear();
  }
  const yearNum = Number(year);
  const currentYear = new Date().getFullYear();
  if (isNaN(yearNum) || (yearNum !== currentYear && yearNum !== currentYear - 1)) {
    throw new ValidationError([{ path: ResourcePath.YEAR, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return yearNum;
};

export const getValidatedBelongsToPathParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("pathParam.getValidatedBelongsTo", _logger);
  const belongsTo = event.pathParameters?.belongsTo;
  logger.info("in pathparam, belongsTo =", belongsTo);

  if (!belongsTo) {
    throw new ValidationError([{ path: ResourcePath.BelongsTo, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (!Object.values(ExpenseBelongsTo).includes(belongsTo as ExpenseBelongsTo)) {
    throw new ValidationError([{ path: ResourcePath.BelongsTo, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return belongsTo as ExpenseBelongsTo;
};
