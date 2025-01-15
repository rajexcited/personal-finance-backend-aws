import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONObject, NotFoundError, UnAuthorizedError, apiGatewayHandlerWrapper } from "../apigateway";
import { utils, getLogger, dbutil, LoggerBase } from "../utils";
import { DbItemConfigType, ApiConfigTypeResource } from "./resource-type";
import { getAuthorizeUser, getValidatedUserId } from "../user";
import {
  _logger,
  _configTypeTableName,
  _belongsToGsiName,
  BelongsTo,
  ConfigStatus,
  getValidatedBelongsTo,
  getBelongsToGsiPk,
  getValidatedConfigId,
  getDetailsTablePk
} from "./base-config";
import { caching } from "cache-manager";
import ms from "ms";

const belongsToConfigListMemoryCache = caching("memory", {
  max: 3,
  ttl: ms("60 sec")
});

/**
 * DynamoDB code example
 * https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html
 */

export const getDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getDetails", _logger);

  const belongsTo = getValidatedBelongsTo(event, logger);
  const userId = getValidatedUserId(event);
  const configId = getValidatedConfigId(event, logger);

  logger.info("request, belongsTo =", belongsTo, ", configId =", configId);
  const getCmdInput = {
    TableName: _configTypeTableName,
    Key: { PK: getDetailsTablePk(configId) }
  };
  const getOutput = await dbutil.getItem(getCmdInput, logger, dbutil.CacheAction.FROM_CACHE);
  logger.info("retrieved db result output");

  const dbItem = getOutput?.Item as DbItemConfigType;
  if (!dbItem) {
    throw new NotFoundError("db item not found");
  }
  // validate user access to config details
  const gsiPkForReq = getBelongsToGsiPk(null, logger, userId, belongsTo);
  if (gsiPkForReq !== dbItem.UB_GSI_PK) {
    // not same user
    throw new UnAuthorizedError("not authorized to get config type details");
  }

  const details = dbItem.details;
  const auditDetails = await utils.parseAuditDetails(details.auditDetails, userId, getAuthorizeUser(event));
  const apiResource: ApiConfigTypeResource = {
    id: details.id,
    name: details.name,
    value: details.value,
    status: details.status,
    tags: details.tags,
    belongsTo: details.belongsTo,
    auditDetails: auditDetails,
    color: details.color,
    description: details.description
  };

  return apiResource as unknown as JSONObject;
});

export const getConfigId = async (configName: string, userId: string, belongsTo: BelongsTo, _logger: LoggerBase) => {
  const logger = getLogger("getConfigId", _logger);

  const belongsToConfigListCache = await belongsToConfigListMemoryCache;
  const items = await belongsToConfigListCache.wrap(userId + belongsTo, async () => {
    const itemPromises = await dbutil.queryAll<DbItemConfigType>(logger, {
      TableName: _configTypeTableName,
      IndexName: _belongsToGsiName,
      KeyConditionExpression: `UB_GSI_PK = :pkv`,
      ExpressionAttributeValues: {
        ":pkv": getBelongsToGsiPk(null, logger, userId, belongsTo)
      }
    });

    return await Promise.all(itemPromises);
  });

  logger.info("retrieved", items.length, "items");
  const matching = items.filter((item) => item.details.name === configName);

  let foundItem = matching.find((item) => item.details.status === ConfigStatus.ENABLE);
  if (foundItem) {
    return foundItem.details.id;
  }

  foundItem = matching.find((item) => item.details.status === ConfigStatus.DISABLE);
  if (foundItem) {
    return foundItem.details.id;
  }

  foundItem = matching.find((item) => item.details.status === ConfigStatus.DELETED);
  if (foundItem) {
    return foundItem.details.id;
  }

  return null;
};
