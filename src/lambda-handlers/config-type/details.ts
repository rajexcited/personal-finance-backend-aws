import { APIGatewayProxyEvent } from "aws-lambda";
import { ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import { utils, getLogger, dbutil } from "../utils";
import { DbConfigTypeItem, ApiConfigTypeResource, BelongsTo, Status, DefaultConfigData, DbConfigTypeDetails } from "./resource-type";
import { getValidatedUserId } from "../user";
import { _logger, StatusQueryParam, _configTypeTableName, _belongsToGsiName, ResourcePath, ErrorMessage } from "./base-config";
import { v4 as uuidv4 } from "uuid";

/**
 * DynamoDB code example
 * https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html
 */

export const getDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getDetails", _logger);

  const itemDetails = await getConfigItemDetails(event);
  const userId = getValidatedUserId(event);
  const resourcePromises = itemDetails.map(async (details) => {
    const auditDetails = await utils.parseAuditDetails(details.auditDetails, userId);
    logger.info("userId", userId, "auditDetails", auditDetails);

    const resource: ApiConfigTypeResource = {
      id: details.id,
      name: details.name,
      value: details.value,
      color: details.color,
      belongsTo: details.belongsTo,
      status: details.status,
      description: details.description,
      tags: details.tags,
      auditDetails: auditDetails,
    };
    return resource;
  });

  const resources = await Promise.all(resourcePromises);
  return resources;
});

export const createDetails = async (details: DefaultConfigData[], belongsTo: BelongsTo, userId: string) => {
  const logger = getLogger("createDetails", _logger);
  logger.info("details", details);
  const auditDetails = utils.updateAuditDetails(null, userId);
  if (!auditDetails) {
    throw new Error("invalid auditDetails");
  }
  const items = details.map((detail) => {
    const itemDetail: DbConfigTypeDetails = {
      id: uuidv4(),
      belongsTo: belongsTo,
      name: detail.name,
      value: detail.value,
      description: detail.description,
      tags: detail.tags,
      status: Status.ENABLE,
      auditDetails: { ...auditDetails },
    };
    const item: DbConfigTypeItem = {
      details: itemDetail,
      PK: getDetailsTablePk(itemDetail.id),
      UB_GSI_PK: getBelongsToGsiPk(null, userId, belongsTo),
      UB_GSI_SK: getBelongsToGsiSk(Status.ENABLE),
    };
    return item;
  });

  await dbutil.batchAddUpdate(items, _configTypeTableName, logger);
  return items.map((item) => item.details);
};

const getConfigItemDetails = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getConfigItemDetails", _logger);
  const statusValues = event.multiValueQueryStringParameters?.status || [Status.ENABLE, Status.DISABLE];
  logger.info("statusValues", statusValues);
  const statusMapEntries: [string, Status][] = statusValues.map((val, ind) => [`:st${ind + 1}`, getValidatedStatus(val)]);

  const queryStatusObj: StatusQueryParam = Object.fromEntries(statusMapEntries);
  const statusKeys = Object.keys(queryStatusObj).join(", ");
  logger.info("queryStatusObj", queryStatusObj, "statusKeys", statusKeys);

  const output = await dbutil.ddbClient.query({
    TableName: _configTypeTableName,
    IndexName: _belongsToGsiName,
    KeyConditionExpression: `UB_GSI_PK = :pk and UB_GSI_SK in (${statusKeys})`,
    ExpressionAttributeValues: {
      ":pk": getBelongsToGsiPk(event),
      ...queryStatusObj,
    },
  });
  logger.info("db result", output);
  const items = (output.Items || []) as DbConfigTypeItem[];
  return items.map((item) => item.details);
};

const getBelongsToGsiPk = (event: APIGatewayProxyEvent | null, userId?: string, belongsTo?: BelongsTo) => {
  if (event) {
    userId = getValidatedUserId(event);
    belongsTo = getValidatedBelongsTo(event);
  }
  return `userId#${userId}#belongsTo#${belongsTo}`;
};

const getDetailsTablePk = (configId: string) => {
  return `configId#${configId}`;
};

const getBelongsToGsiSk = (status: Status) => {
  return `status#${status}`;
};

const getValidatedStatus = (val: string) => {
  let res: Status;
  switch (val) {
    case Status.ENABLE:
      res = Status.ENABLE;
      break;
    case Status.DISABLE:
      res = Status.DISABLE;
      break;
    case Status.DELETED:
      res = Status.DELETED;
      break;
    default:
      throw new ValidationError([{ path: ResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }
  return res;
};

const getValidatedBelongsTo = (event: APIGatewayProxyEvent) => {
  const belongsTo = event.pathParameters?.belongsTo;
  if (!belongsTo) {
    throw new ValidationError([{ path: ResourcePath.BELONGS_TO, message: ErrorMessage.MISSING_VALUE }]);
  }
  if (BelongsTo.ExpenseCategory !== belongsTo && BelongsTo.PaymentAccountType !== belongsTo) {
    throw new ValidationError([{ path: ResourcePath.BELONGS_TO, message: ErrorMessage.INCORRECT_VALUE }]);
  }
  return belongsTo;
};
