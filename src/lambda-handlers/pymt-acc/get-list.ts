import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONArray, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import { LoggerBase, compareutil, dbutil, getLogger, utils } from "../utils";
import {
  ErrorMessage,
  PymtAccResourcePath,
  PymtAccStatus,
  _logger,
  _pymtAccTableName,
  _userIdStatusShortnameIndex,
  getUserIdStatusShortnameGsiPk,
} from "./base-config";
import { getAuthorizeUser, getValidatedUserId } from "../user";
import { ApiPaymentAccountResource, DbItemPymtAcc } from "./resource-type";
import { getDefaultCurrencyProfile } from "../config-type";

export const getPaymentAccountList = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getPaymentAccountList", _logger);
  const userId = getValidatedUserId(event);
  const statusParam = getValidatedStatusPathParam(event, logger);

  const pymtAccounts = await getListOfDetails(userId, statusParam, logger);
  const resourcePromises = pymtAccounts.map(async (details) => {
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
      currencyProfileId: details.profileId,
    };
    return resource;
  });
  const resources = await Promise.all(resourcePromises);
  resources.sort(sortCompareFn);

  return resources as unknown as JSONArray;
});

const getListOfDetails = async (userId: string, status: PymtAccStatus, _logger: LoggerBase) => {
  const logger = getLogger("getListOfDetails", _logger);

  const currencyProfile = await getDefaultCurrencyProfile(userId, logger);
  const items = await dbutil.queryAll<DbItemPymtAcc>(logger, {
    TableName: _pymtAccTableName,
    IndexName: _userIdStatusShortnameIndex,
    KeyConditionExpression: "UP_GSI_PK = :pkv",
    ExpressionAttributeValues: {
      ":pkv": getUserIdStatusShortnameGsiPk(userId, status, currencyProfile),
    },
  });
  logger.info("retrieved", items.length, "items for status [", status, "]");
  return items.map((item) => item.details);
};

const sortCompareFn = (item1: ApiPaymentAccountResource, item2: ApiPaymentAccountResource) => {
  /**
   * priority 1 => by updatedOn
   * priority 2 => by createdOn
   * priority 3 => by shortName
   */
  const updatedOnCompareResult = compareutil.compareUpdatedOn(item1.auditDetails, item2.auditDetails);
  if (updatedOnCompareResult !== 0) return updatedOnCompareResult;

  const createdOnCompareResult = compareutil.compareCreatedOn(item1.auditDetails, item2.auditDetails);
  if (createdOnCompareResult !== 0) return createdOnCompareResult;

  const nameCompareResult = item1.shortName.localeCompare(item2.shortName);
  if (nameCompareResult !== 0) return nameCompareResult;

  return 0;
};

const getValidatedStatusPathParam = (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedStatus", _logger);
  const status = event.queryStringParameters?.status;
  logger.info("query parameter, status =", status);

  if (!status) {
    return PymtAccStatus.ENABLE;
  }

  if (status !== PymtAccStatus.DELETED && status !== PymtAccStatus.ENABLE) {
    throw new ValidationError([{ path: PymtAccResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return status as PymtAccStatus;
};
