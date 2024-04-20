import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONObject, UnAuthorizedError, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import {
  ErrorMessage,
  PymtAccResourcePath,
  PymtAccStatus,
  _logger,
  _pymtAccTableName,
  getDetailsTablePk,
  getUserIdStatusShortnameGsiPk,
} from "./base-config";
import { AuditDetailsType, LoggerBase, dbutil, getLogger, utils, validations } from "../utils";
import { getValidatedUserId } from "../user";
import { ApiPaymentAccountResource, DbPymtAccItem } from "./resource-type";

export const deletePaymentAccount = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("deletePaymentAccount", _logger);

  const userId = getValidatedUserId(event);
  const pymtAccId = getValidatedPymtAccId(event, logger);

  const details = await updateStatus(userId, pymtAccId, PymtAccStatus.DELETED);
  const apiResource: ApiPaymentAccountResource = {
    id: details.id,
    shortName: details.shortName,
    accountIdNum: details.accountIdNum,
    institutionName: details.institutionName,
    typeId: details.typeId,
    status: details.status,
    tags: details.tags,
    auditDetails: await utils.parseAuditDetails(details.auditDetails, userId),
    description: details.description,
  };

  return apiResource as unknown as JSONObject;
});

export const updatePaymentAccountStatus = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("updatePaymentAccountStatus", _logger);

  const userId = getValidatedUserId(event);
  const pymtAccId = getValidatedPymtAccId(event, logger);
  const pymtAccStatus = getValidatedPymtAccStatusFromPath(event, logger);

  const details = await updateStatus(userId, pymtAccId, pymtAccStatus);
  const apiResource: ApiPaymentAccountResource = {
    id: details.id,
    shortName: details.shortName,
    accountIdNum: details.accountIdNum,
    institutionName: details.institutionName,
    typeId: details.typeId,
    status: details.status,
    tags: details.tags,
    auditDetails: await utils.parseAuditDetails(details.auditDetails, userId),
    description: details.description,
  };

  return apiResource as unknown as JSONObject;
});

export const updateStatus = async (userId: string, pymtAccId: string, status: PymtAccStatus) => {
  const logger = getLogger("updateStatus", _logger);

  logger.info("request, pymtAccId =", pymtAccId, ", status =", status);
  const getOutput = await dbutil.ddbClient.get({
    TableName: _pymtAccTableName,
    Key: { PK: getDetailsTablePk(pymtAccId) },
  });
  logger.info("retrieved db result output", getOutput);

  const dbItem = getOutput.Item as DbPymtAccItem;
  // validate user access to config details
  const gsiPkForReq = getUserIdStatusShortnameGsiPk(userId, dbItem.details.status);
  if (gsiPkForReq !== dbItem.UP_GSI_PK) {
    // not same user
    throw new UnAuthorizedError("not authorized to update status of payment account");
  }

  const auditDetails = utils.updateAuditDetails(dbItem.details.auditDetails, userId);
  const updateDbItem: DbPymtAccItem = {
    PK: getDetailsTablePk(pymtAccId),
    UP_GSI_PK: getUserIdStatusShortnameGsiPk(userId, status),
    UP_GSI_SK: dbItem.UP_GSI_SK,
    details: {
      ...dbItem.details,
      auditDetails: auditDetails as AuditDetailsType,
      status: status,
    },
  };

  const updatedOutput = await dbutil.ddbClient.put({
    TableName: _pymtAccTableName,
    Item: updateDbItem,
  });

  logger.info("updated status for payment account, output=", updatedOutput);
  return updateDbItem.details;
};

const getValidatedPymtAccId = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("getValidatedBelongsTo", loggerBase);
  const pymtAccId = event.pathParameters?.pymtAccId;
  logger.info("path parameter, pymtAccId =", pymtAccId);

  if (!pymtAccId) {
    throw new ValidationError([{ path: PymtAccResourcePath.ID, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (!validations.isValidUuid(pymtAccId)) {
    throw new ValidationError([{ path: PymtAccResourcePath.ID, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return pymtAccId;
};

const getValidatedPymtAccStatusFromPath = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("getValidatedPymtAccStatusFromPath", loggerBase);
  const pymtAccStatus = event.pathParameters?.status;
  logger.info("path parameter, config status =", pymtAccStatus);

  if (!pymtAccStatus) {
    throw new ValidationError([{ path: PymtAccResourcePath.STATUS, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (pymtAccStatus !== PymtAccStatus.ENABLE && pymtAccStatus !== PymtAccStatus.DELETED) {
    throw new ValidationError([{ path: PymtAccResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return pymtAccStatus as PymtAccStatus;
};
