import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONObject, NotFoundError, UnAuthorizedError, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import { getAuthorizeUser, getValidatedUserId } from "../user";
import { AuditDetailsType, LoggerBase, dbutil, getLogger, utils } from "../utils";
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
  getValidatedConfigId,
} from "./base-config";
import { ApiConfigTypeResource, DbItemConfigType } from "./resource-type";

export const deleteDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("deleteDetails", _logger);
  const belongsTo = getValidatedBelongsTo(event, logger);
  const userId = getValidatedUserId(event);
  const configId = getValidatedConfigId(event, logger);
  await validateDeleteConfig(belongsTo, userId, ConfigStatus.DELETED, logger);

  const details = await updateStatus(belongsTo, userId, configId, ConfigStatus.DELETED);

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
    description: details.description,
  };

  return apiResource as unknown as JSONObject;
});

export const updateStatus = async (belongsTo: BelongsTo, userId: string, configId: string, status: ConfigStatus) => {
  const logger = getLogger("updateStatus", _logger);

  logger.info("request, belongsTo =", belongsTo, ", configId =", configId, ", status =", status);
  const getCmdInput = {
    TableName: _configTypeTableName,
    Key: { PK: getDetailsTablePk(configId) },
  };
  const getOutput = await dbutil.getItem(getCmdInput, logger);
  logger.info("retrieved db result output");

  const dbItem = getOutput.Item as DbItemConfigType;
  if (!dbItem) {
    throw new NotFoundError("db item not found");
  }
  // validate user access to config details
  const gsiPkForReq = getBelongsToGsiPk(null, logger, userId, belongsTo);
  if (gsiPkForReq !== dbItem.UB_GSI_PK) {
    // not same user
    throw new UnAuthorizedError("not authorized to delete config type details");
  }
  if (dbItem.details.status === status) {
    throw new ValidationError([{ path: ConfigResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const auditDetails = utils.updateAuditDetails(dbItem.details.auditDetails, userId);
  const updateDbItem: DbItemConfigType = {
    PK: getDetailsTablePk(configId),
    UB_GSI_PK: getBelongsToGsiPk(null, logger, userId, belongsTo),
    UB_GSI_SK: getBelongsToGsiSk(status),
    details: {
      ...dbItem.details,
      auditDetails: auditDetails as AuditDetailsType,
      status: status,
    },
  };

  const putCmdInput = {
    TableName: _configTypeTableName,
    Item: updateDbItem,
  };
  await dbutil.putItem(putCmdInput, logger);

  logger.info("updated status for config type");
  return updateDbItem.details;
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
    const items = await dbutil.queryAll<DbItemConfigType>(logger, {
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
