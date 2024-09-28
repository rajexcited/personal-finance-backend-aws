import { APIGatewayProxyEvent } from "aws-lambda";
import { apiGatewayHandlerWrapper } from "../apigateway";
import { getLogger, dbutil } from "../utils";
import { DbItemConfigType } from "./resource-type";
import { _logger, _configTypeTableName, _belongsToGsiName, getValidatedBelongsTo, getBelongsToGsiPk } from "./base-config";

/**
 * DynamoDB code example
 * https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html
 */
export const getConfigTypeTags = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getConfigTypeTags", _logger);

  const belongsTo = getValidatedBelongsTo(event, logger);
  // if (isBelongsToValid(belongsTo)) {
  //   throw new NotFoundError("invalida belongs to provided [" + belongsTo + "]");
  // }

  // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ProjectionExpressions.html
  const items = await dbutil.queryAll<DbItemConfigType>(logger, {
    TableName: _configTypeTableName,
    IndexName: _belongsToGsiName,
    KeyConditionExpression: `UB_GSI_PK = :pkv`,
    ExpressionAttributeValues: {
      ":pkv": getBelongsToGsiPk(event, logger),
    },
    ProjectionExpression: "details.tags",
  });

  logger.info("retrieved [", items.length, "] ", belongsTo, " config type items =", items);
  const tagList = items.flatMap((item) => item.details.tags);
  const tagSet = new Set(tagList);

  logger.info("retrieved tag size =", tagList.length, ", unique value size =", tagSet.size);
  return [...tagSet];
});
