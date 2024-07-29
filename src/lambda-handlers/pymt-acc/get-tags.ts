import { APIGatewayProxyEvent } from "aws-lambda";
import { apiGatewayHandlerWrapper } from "../apigateway";
import { getLogger, dbutil } from "../utils";
import { DbItemPymtAcc } from "./resource-type";
import { _logger, _pymtAccTableName, _userIdStatusShortnameIndex, getUserIdStatusShortnameGsiPk, PymtAccStatus } from "./base-config";
import { getValidatedUserId } from "../user";

/**
 * DynamoDB code example
 * https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html
 */
export const getPaymentAccountTags = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getPaymentAccountTags", _logger);

  const userId = getValidatedUserId(event);

  const items = await dbutil.queryAll<DbItemPymtAcc>(logger, {
    TableName: _pymtAccTableName,
    IndexName: _userIdStatusShortnameIndex,
    KeyConditionExpression: `UB_GSI_PK = :pkv`,
    ExpressionAttributeValues: {
      ":pkv": getUserIdStatusShortnameGsiPk(userId, PymtAccStatus.ENABLE),
    },
    ProjectionExpression: "details.tags",
  });

  logger.info("retrieved [", items.length, "] payment account items =", items);

  const tagList = items.flatMap((item) => item.details.tags);
  const tagSet = new Set(tagList);

  logger.info("retrieved tag size =", tagList.length, ", unique value size =", tagSet.size);
  return [...tagSet];
});
