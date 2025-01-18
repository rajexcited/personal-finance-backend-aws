import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONObject, NotFoundError, UnAuthorizedError, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import {
  ErrorMessage,
  PymtAccResourcePath,
  PymtAccStatus,
  _logger,
  _pymtAccTableName,
  getDetailsTablePk,
  getUserIdStatusShortnameGsiPk,
  getValidatedPymtAccId
} from "./base-config";
import { AuditDetailsType, LoggerBase, dbutil, getLogger, utils } from "../utils";
import { AuthorizeUser, getAuthorizeUser } from "../user";
import { ApiPaymentAccountResource, DbItemPymtAcc } from "./resource-type";
import { getDefaultCurrencyProfile } from "../config-type";

export const deletePaymentAccount = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("deletePaymentAccount", _logger);

  const authUser = getAuthorizeUser(event);
  const pymtAccId = getValidatedPymtAccId(event, logger);

  const details = await updateStatus(authUser, pymtAccId, PymtAccStatus.DELETED);
  const auditDetails = await utils.parseAuditDetails(details.auditDetails, authUser.userId, getAuthorizeUser(event));
  const apiResource: ApiPaymentAccountResource = {
    id: details.id,
    shortName: details.shortName,
    accountIdNum: details.accountIdNum,
    institutionName: details.institutionName,
    typeId: details.typeId,
    status: details.status,
    tags: details.tags,
    auditDetails: auditDetails,
    description: details.description,
    currencyProfileId: details.currencyProfileId
  };

  return apiResource as unknown as JSONObject;
});

export const updatePaymentAccountStatus = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("updatePaymentAccountStatus", _logger);

  const authUser = getAuthorizeUser(event);
  const pymtAccId = getValidatedPymtAccId(event, logger);
  const pymtAccStatus = getValidatedPymtAccStatusFromPath(event, logger);

  const details = await updateStatus(authUser, pymtAccId, pymtAccStatus);
  const auditDetails = await utils.parseAuditDetails(details.auditDetails, authUser.userId, getAuthorizeUser(event));
  const apiResource: ApiPaymentAccountResource = {
    id: details.id,
    shortName: details.shortName,
    accountIdNum: details.accountIdNum,
    institutionName: details.institutionName,
    typeId: details.typeId,
    status: details.status,
    tags: details.tags,
    auditDetails: auditDetails,
    description: details.description,
    currencyProfileId: details.currencyProfileId
  };

  return apiResource as unknown as JSONObject;
});

export const updateStatus = async (authUser: AuthorizeUser, pymtAccId: string, status: PymtAccStatus) => {
  const logger = getLogger("updateStatus", _logger);

  logger.info("request, pymtAccId =", pymtAccId, ", status =", status);
  const getCmdInput = {
    TableName: _pymtAccTableName,
    Key: { PK: getDetailsTablePk(pymtAccId) }
  };
  const getOutput = await dbutil.getItem(getCmdInput, logger, dbutil.CacheAction.NOT_FROM_CACHE);
  logger.info("retrieved db result output");

  const dbItem = getOutput?.Item as DbItemPymtAcc;
  if (!dbItem) {
    throw new NotFoundError("db item not exists");
  }
  const currencyProfile = await getDefaultCurrencyProfile(authUser.userId, logger);
  // validate user access to config details
  const gsiPkForReq = getUserIdStatusShortnameGsiPk(authUser.userId, dbItem.details.status, currencyProfile);
  if (gsiPkForReq !== dbItem.UP_GSI_PK) {
    // not same user
    throw new UnAuthorizedError("not authorized to update status of payment account");
  }
  if (dbItem.details.status === PymtAccStatus.Immutable) {
    throw new UnAuthorizedError("not authorized to update status of payment account");
  }
  if (dbItem.details.status === status) {
    throw new ValidationError([{ path: PymtAccResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const auditDetails = utils.updateAuditDetailsFailIfNotExists(dbItem.details.auditDetails, authUser);
  const updateDbItem: DbItemPymtAcc = {
    PK: getDetailsTablePk(pymtAccId),
    UP_GSI_PK: getUserIdStatusShortnameGsiPk(authUser.userId, status, currencyProfile),
    UP_GSI_SK: dbItem.UP_GSI_SK,
    details: {
      ...dbItem.details,
      auditDetails: auditDetails as AuditDetailsType,
      status: status
    }
  };

  const putCmdInput = {
    TableName: _pymtAccTableName,
    Item: updateDbItem
  };
  await dbutil.putItem(putCmdInput, logger);

  logger.info("updated status for payment account");
  return updateDbItem.details;
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
