import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONObject, NotFoundError, UnAuthorizedError, apiGatewayHandlerWrapper } from "../apigateway";
import { dbutil, getLogger, utils } from "../utils";
import { _logger, _pymtAccTableName, _userIdStatusShortnameIndex, getDetailsTablePk, getUserIdStatusShortnameGsiPk, getValidatedPymtAccId } from "./base-config";
import { getAuthorizeUser, getValidatedUserId } from "../user";
import { ApiPaymentAccountResource, DbItemPymtAcc } from "./resource-type";
import { getDefaultCurrencyProfile } from "../config-type";

export const getPaymentAccount = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getPaymentAccount", _logger);
  const userId = getValidatedUserId(event);
  const pymtAccId = getValidatedPymtAccId(event, logger);

  logger.info("request, pymtAccId =", pymtAccId);
  const getCmdInput = {
    TableName: _pymtAccTableName,
    Key: { PK: getDetailsTablePk(pymtAccId) }
  };
  const getOutput = await dbutil.getItem(getCmdInput, logger, dbutil.CacheAction.FROM_CACHE);
  logger.info("retrieved db result output");

  const dbItem = getOutput?.Item as DbItemPymtAcc;
  if (!dbItem) {
    throw new NotFoundError("db item not exists");
  }
  // validate user access to config details
  const currencyProfile = await getDefaultCurrencyProfile(userId, logger);
  const gsiPkForReq = getUserIdStatusShortnameGsiPk(userId, dbItem.details.status, currencyProfile);
  if (gsiPkForReq !== dbItem.UP_GSI_PK) {
    // not same user
    throw new UnAuthorizedError("not authorized to get payment account details");
  }

  const details = dbItem.details;
  const auditDetails = await utils.parseAuditDetails(details.auditDetails, userId, getAuthorizeUser(event));
  logger.debug("userId", userId, "auditDetails", auditDetails);

  const resource: ApiPaymentAccountResource = {
    id: details.id,
    shortName: details.shortName,
    typeId: details.typeId,
    accountIdNum: details.accountIdNum,
    institutionName: details.institutionName,
    status: details.status,
    description: details.description,
    tags: details.tags,
    auditDetails: auditDetails,
    currencyProfileId: details.currencyProfileId
  };

  return resource as unknown as JSONObject;
});
