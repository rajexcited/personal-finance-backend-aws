import { APIGatewayProxyEvent } from "aws-lambda";
import { getLogger, LoggerBase } from "../../utils";
import { NotFoundError, ValidationError } from "../../apigateway";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";
import { ErrorMessage } from "./error";

enum QueryParamResourcePath {
  REQUEST = "request",
  PAGE_NO = "pageNo",
  STATUS = "status",
  PAGE_MONTHS = "pageMonths",
  BELONGS_TO = "belongsTo",
  YEAR = "year",
}

/**
 * single value query param
 * criteria:
 *  - required
 *  - number
 *  - should be greater than 0
 * @param event
 * @param _logger
 * @returns
 */
export const getValidatedPageNumberQueryParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("queryParam.getValidatedPageNumber", _logger);
  const pageNo = event.queryStringParameters?.pageNo;
  logger.info("query parameter, pageNo =", pageNo);

  if (!pageNo) {
    throw new ValidationError([{ path: QueryParamResourcePath.PAGE_NO, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (isNaN(Number(pageNo)) || Number(pageNo) < 1) {
    throw new ValidationError([{ path: QueryParamResourcePath.PAGE_NO, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return Number(pageNo);
};

/**
 * single value query param
 * criteria:
 *  - optional. default value is `ExpenseStatus.ENABLE`
 *  - enum of ExpenseStatus
 *
 * @param event
 * @param _logger
 * @returns
 */
export const getValidatedStatusQueryParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("queryParam.getValidatedStatus", _logger);
  const status = event.queryStringParameters?.status;
  logger.info("query parameter, status =", status);

  if (status && status !== ExpenseStatus.DELETED && status !== ExpenseStatus.ENABLE && status !== ExpenseStatus.DISABLE) {
    throw new ValidationError([{ path: QueryParamResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  if (!status) {
    return ExpenseStatus.ENABLE;
  }
  return status as ExpenseStatus;
};

/**
 * single value query param
 * criteria:
 *  - optional. default is All
 *  - enum of ExpenseBelongsTo
 *
 * @param event
 * @param _logger
 * @returns
 */
export const getValidatedBelongsToQueryParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("queryParam.getValidatedBelongsTo", _logger);
  const belongsTo = event.queryStringParameters?.belongsTo;
  logger.info("query parameter, belongsTo =", belongsTo);

  if (!belongsTo) {
    return null;
  }

  if (
    belongsTo !== ExpenseBelongsTo.Purchase &&
    belongsTo !== ExpenseBelongsTo.Refund &&
    belongsTo !== ExpenseBelongsTo.Income &&
    belongsTo !== ExpenseBelongsTo.Investment
  ) {
    throw new ValidationError([{ path: QueryParamResourcePath.BELONGS_TO, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return belongsTo as ExpenseBelongsTo;
};

const MONTHS_PER_PAGE = 3;
const MAX_PAGE_SIZE_MONTHS = 12;
/**
 * single value query param
 * criteria:
 *    - optional. default value is 3
 *    - number
 *    - greater than 0
 *
 * @param event
 * @param status
 * @param _logger
 * @returns
 */
export const getValidatedPageMonthsQueryParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("queryParam.getValidatedPageMonths", _logger);
  const pageMonths = event.queryStringParameters?.pageMonths;
  logger.info("query parameter, pageMonths =", pageMonths);

  const pageMonthsNum = Number(pageMonths);
  if ((pageMonths && isNaN(pageMonthsNum)) || pageMonthsNum < 1) {
    throw new ValidationError([{ path: QueryParamResourcePath.PAGE_MONTHS, message: ErrorMessage.INCORRECT_VALUE }]);
  }
  if (pageMonthsNum > MAX_PAGE_SIZE_MONTHS) {
    throw new ValidationError([{ path: QueryParamResourcePath.PAGE_MONTHS, message: ErrorMessage.LIMIT_EXCEEDED }]);
  }
  if (!pageMonths) {
    return MONTHS_PER_PAGE;
  }
  return pageMonthsNum;
};

export const getValidatedExpenseYearQueryParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("queryParam.getValidatedExpenseYear", _logger);
  const years = event.multiValueQueryStringParameters?.year;
  logger.info("query parameter, expense years =", years);

  if (!years || years.length === 0) {
    throw new NotFoundError("year is not provided");
  }

  const invalidParamValue = years.map((yr) => isNaN(Number(yr))).find((nan) => nan);
  if (invalidParamValue) {
    throw new ValidationError([{ path: QueryParamResourcePath.YEAR, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return years.map((yr) => Number(yr));
};
