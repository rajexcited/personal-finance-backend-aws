import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONObject, UnAuthorizedError, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import { getValidatedUserId } from "../user";
import { AuditDetailsType, LoggerBase, dbutil, getLogger, utils, validations } from "../utils";
import {
  ConfigResourcePath,
  ErrorMessage,
  _configTypeTableName,
  _logger,
  BelongsTo,
  getBelongsToGsiPk,
  getBelongsToGsiSk,
  getDetailsTablePk,
  getValidatedBelongsTo,
  ConfigStatus,
  _belongsToGsiName,
} from "./base-config";
import { ApiConfigTypeResource, DbConfigTypeItem } from "./resource-type";

export const deleteDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("deleteDetails", _logger);
  const belongsTo = getValidatedBelongsTo(event, logger);
  const userId = getValidatedUserId(event);
  const configId = getValidatedConfigId(event, logger);
  await validateDeleteConfig(belongsTo, userId, ConfigStatus.DELETED, logger);

  const details = await updateStatus(belongsTo, userId, configId, ConfigStatus.DELETED);
  const apiResource: ApiConfigTypeResource = {
    id: details.id,
    name: details.name,
    value: details.value,
    status: details.status,
    tags: details.tags,
    belongsTo: details.belongsTo,
    auditDetails: await utils.parseAuditDetails(details.auditDetails, userId),
    color: details.color,
    description: details.description,
  };

  return apiResource as unknown as JSONObject;
});

export const updateStatusDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("updateStatusDetails", _logger);
  const belongsTo = getValidatedBelongsTo(event, logger);
  const userId = getValidatedUserId(event);
  const configId = getValidatedConfigId(event, logger);
  const configStatus = getValidatedConfigStatusFromPath(event, logger);
  await validateDeleteConfig(belongsTo, userId, configStatus, logger);

  const details = await updateStatus(belongsTo, userId, configId, configStatus);
  const apiResource: ApiConfigTypeResource = {
    id: details.id,
    name: details.name,
    value: details.value,
    status: details.status,
    tags: details.tags,
    belongsTo: details.belongsTo,
    auditDetails: await utils.parseAuditDetails(details.auditDetails, userId),
    color: details.color,
    description: details.description,
  };

  return apiResource as unknown as JSONObject;
});

export const updateStatus = async (belongsTo: BelongsTo, userId: string, configId: string, status: ConfigStatus) => {
  const logger = getLogger("updateStatus", _logger);

  logger.info("request, belongsTo =", belongsTo, ", configId =", configId, ", status =", status);
  const getOutput = await dbutil.ddbClient.get({
    TableName: _configTypeTableName,
    Key: { PK: getDetailsTablePk(configId) },
  });
  logger.info("retrieved db result output", getOutput);

  const dbItem = getOutput.Item as DbConfigTypeItem;
  // validate user access to config details
  const gsiPkForReq = getBelongsToGsiPk(null, logger, userId, belongsTo);
  if (gsiPkForReq !== dbItem.UB_GSI_PK) {
    // not same user
    throw new UnAuthorizedError("not authorized to delete config type details");
  }

  const auditDetails = utils.updateAuditDetails(dbItem.details.auditDetails, userId);
  const updateDbItem: DbConfigTypeItem = {
    PK: getDetailsTablePk(configId),
    UB_GSI_PK: getBelongsToGsiPk(null, logger, userId, belongsTo),
    UB_GSI_SK: getBelongsToGsiSk(status),
    details: {
      ...dbItem.details,
      auditDetails: auditDetails as AuditDetailsType,
      status: status,
    },
  };

  const updatedOutput = await dbutil.ddbClient.put({
    TableName: _configTypeTableName,
    Item: updateDbItem,
  });

  logger.info("updated status for config type, output=", updatedOutput);
  return updateDbItem.details;
};

const getValidatedConfigId = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("getValidatedBelongsTo", loggerBase);
  const configId = event.pathParameters?.configId;
  logger.info("path parameter, configId =", configId);

  if (!configId) {
    throw new ValidationError([{ path: ConfigResourcePath.ID, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (!validations.isValidUuid(configId)) {
    throw new ValidationError([{ path: ConfigResourcePath.ID, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return configId;
};

const getValidatedConfigStatusFromPath = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("getValidatedConfigStatusFromPath", loggerBase);
  const configStatus = event.pathParameters?.status;
  logger.info("path parameter, config status =", configStatus);

  if (!configStatus) {
    throw new ValidationError([{ path: ConfigResourcePath.STATUS, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (configStatus !== ConfigStatus.ENABLE && configStatus !== ConfigStatus.DISABLE && configStatus !== ConfigStatus.DELETED) {
    throw new ValidationError([{ path: ConfigResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return configStatus as ConfigStatus;
};

const validateDeleteConfig = async (belongsTo: BelongsTo, userId: string, status: ConfigStatus, baseLogger: LoggerBase) => {
  if (status === ConfigStatus.DELETED && belongsTo === BelongsTo.CurrencyProfile) {
    const logger = getLogger("validateDeleteConfig", baseLogger);
    const items = await dbutil.queryAll<DbConfigTypeItem>(logger, {
      TableName: _configTypeTableName,
      IndexName: _belongsToGsiName,
      KeyConditionExpression: `UB_GSI_PK = :pkv and UB_GSI_SK = :stv`,
      ExpressionAttributeValues: {
        ":pkv": getBelongsToGsiPk(null, logger, userId, belongsTo),
        ":stv": getBelongsToGsiSk(status),
      },
    });
    logger.info("retrieved", items.length, "items for status [", status, "]");
    if (items.length < 2) {
      throw new ValidationError([{ path: ConfigResourcePath.REQUEST, message: ErrorMessage.DELETE_NOT_PERMITTED }]);
    }
  }
};
