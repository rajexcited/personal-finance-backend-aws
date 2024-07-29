import { APIGatewayProxyEvent } from "aws-lambda";
import { NotFoundError, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import { getLogger, dbutil, LoggerBase } from "../utils";
import { DbItemExpenseTags } from "./resource-type";
import {
  _logger,
  _expenseTableName,
  _userIdStatusDateIndex,
  ExpenseStatus,
  getUserIdStatusDateGsiPk,
  getUserIdStatusTagGsiSk,
  ErrorMessage,
  ExpenseResourcePath,
} from "./base-config";
import { getValidatedUserId } from "../user";

/**
 * DynamoDB code example
 * https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html
 */
export const getExpenseTags = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getExpenseTags", _logger);

  const userId = getValidatedUserId(event);
  const purchasedYears = getValidatedPurchasedYearPathParam(event, logger);

  const tagsEnabledByYearsPromises = purchasedYears.map((purchasedYear) => getExpenseTagList(userId, ExpenseStatus.ENABLE, purchasedYear, logger));

  const currentYear = new Date().getFullYear();
  let tagsDeletedPromise: Promise<string[]>;
  if (purchasedYears.includes(currentYear)) {
    tagsDeletedPromise = getExpenseTagList(userId, ExpenseStatus.DELETED, currentYear, logger);
  } else {
    tagsDeletedPromise = Promise.resolve([]);
  }
  const tagsByYears = await Promise.all([...tagsEnabledByYearsPromises, tagsDeletedPromise]);
  logger.info("retrieved [", tagsByYears.length, "] expenses =", tagsByYears);
  const tagList = tagsByYears.flat();
  const tagSet = new Set(tagList);

  logger.info("retrieved tag size =", tagList.length, ", unique value size =", tagSet.size);
  return [...tagSet];
});

const getExpenseTagList = async (userId: string, status: ExpenseStatus, purchasedYear: number, _logger: LoggerBase) => {
  const logger = getLogger("getExpenseTagList", _logger);
  const dbItemTags = await dbutil.queryAll<DbItemExpenseTags>(logger, {
    TableName: _expenseTableName,
    IndexName: _userIdStatusDateIndex,
    KeyConditionExpression: "UD_GSI_PK = :gpkv and UD_GSI_SK = :gskv",
    ExpressionAttributeValues: {
      ":gpkv": getUserIdStatusDateGsiPk(userId, status),
      ":gskv": getUserIdStatusTagGsiSk(purchasedYear),
    },
  });
  logger.info("retrieved [", dbItemTags.length, "] expenses with status =", status, ", purchasedYear =", purchasedYear);
  return dbItemTags.flatMap((item) => item.details.tags);
};

const getValidatedPurchasedYearPathParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedPurchasedYear", _logger);
  const purchasedYears = event.multiValueQueryStringParameters?.purchasedYear;
  logger.info("query parameter, purchasedYear =", purchasedYears);

  if (!purchasedYears) {
    throw new NotFoundError("purchased date not provided");
  }

  const invalidParamValue = purchasedYears.map((yr) => isNaN(Number(yr))).find((nan) => nan);
  if (invalidParamValue) {
    throw new ValidationError([{ path: ExpenseResourcePath.PURCHASE_YEAR, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return purchasedYears.map((yr) => Number(yr));
};
