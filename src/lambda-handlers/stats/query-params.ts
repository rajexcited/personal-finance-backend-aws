import { APIGatewayProxyEvent } from "aws-lambda";
import { getLogger, LoggerBase } from "../utils";
import { ValidationError } from "../apigateway";

enum ErrorMessage {
  INCORRECT_VALUE = "incorrect value",
  MISSING_VALUE = "missing value",
}

enum ResourcePath {
  YEAR = "year",
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
