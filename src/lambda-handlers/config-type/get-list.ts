import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONArray, JSONObject, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import { utils, getLogger, dbutil, LoggerBase, compareutil } from "../utils";
import { DbItemConfigType, ApiConfigTypeResource, ApiCurrencyProfileResource } from "./resource-type";
import { getAuthorizeUser, getValidatedUserId } from "../user";
import {
  _logger,
  _configTypeTableName,
  _belongsToGsiName,
  BelongsTo,
  ConfigStatus,
  ConfigResourcePath,
  ErrorMessage,
  getValidatedBelongsTo,
  getBelongsToGsiSk,
  getBelongsToGsiPk,
} from "./base-config";
import { getCurrencyByCountry } from "../settings";

/**
 * DynamoDB code example
 * https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html
 */

export const getListOfDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getListOfDetails", _logger);

  const belongsTo = getValidatedBelongsTo(event, logger);

  const itemDetails = await getConfigItemDetails(event);
  const userId = getValidatedUserId(event);
  let resourcePromises;

  resourcePromises = itemDetails.map(async (details) => {
    const auditDetails = await utils.parseAuditDetails(details.auditDetails, userId, getAuthorizeUser(event));
    logger.debug("userId", userId, "auditDetails", auditDetails);

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
  if (belongsTo === BelongsTo.CurrencyProfile) {
    logger.info("special type of BelongsTo,", belongsTo, "requested. so adding additional details to resource result");
    const currencyProfileData = await getCurrencyByCountry(logger);
    resources.forEach((rsc) => {
      const currencyCountryData = currencyProfileData.find((cfd) => cfd.country.code === rsc.name && cfd.currency.code === rsc.value);
      if (!currencyCountryData) {
        throw new ValidationError([{ path: ConfigResourcePath.COUNTRY, message: ErrorMessage.INCORRECT_VALUE }]);
      }

      const currencyResource = rsc as ApiCurrencyProfileResource;
      currencyResource.country = {
        name: currencyCountryData.country.name,
        code: currencyCountryData.country.code,
      };
      currencyResource.currency = {
        name: currencyCountryData.currency.name,
        code: currencyCountryData.currency.code,
        symbol: currencyCountryData.currency.symbol,
      };
    });
  }
  resources.sort(sortCompareFn);

  return resources as unknown as JSONArray;
});

const getConfigItemDetails = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getConfigItemDetails", _logger);
  const statusValues = getValidatedConfigStatusFromQuery(event, logger);
  logger.info("statusValues", statusValues);

  type ConditionExpression = { expression: string; attributeValues: JSONObject; status: string };
  const skConditions: ConditionExpression[] = [];

  if (statusValues.length === 3) {
    skConditions.push({
      expression: "",
      attributeValues: {},
      status: "all",
    });
  } else {
    statusValues.map((st) => {
      skConditions.push({
        expression: "and UB_GSI_SK = :stv",
        attributeValues: { ":stv": getBelongsToGsiSk(st) },
        status: st,
      });
    });
  }

  const configItemPromises = skConditions.map(async (cond) => {
    const items = await dbutil.queryAll<DbItemConfigType>(logger, {
      TableName: _configTypeTableName,
      IndexName: _belongsToGsiName,
      KeyConditionExpression: `UB_GSI_PK = :pkv ${cond.expression}`,
      ExpressionAttributeValues: {
        ":pkv": getBelongsToGsiPk(event, logger),
        ...cond.attributeValues,
      },
    });
    logger.info("retrieved", items.length, "items for status [", cond.status, "]");
    return items.map((item) => item.details);
  });

  const configItems = await Promise.all(configItemPromises);
  return configItems.flatMap((items) => items);
};

const sortCompareFn = (item1: ApiConfigTypeResource, item2: ApiConfigTypeResource) => {
  /**
   * priority 1 => by status
   * priority 2 => by updatedOn
   * priority 3 => by createdOn
   * priority 4 => by name
   */
  const statusCompareResult = compareStatus(item1.status, item1.status);
  if (statusCompareResult !== 0) return statusCompareResult;

  const updatedOnCompareResult = compareutil.compareUpdatedOn(item1.auditDetails, item2.auditDetails);
  if (updatedOnCompareResult !== 0) return updatedOnCompareResult;

  const createdOnCompareResult = compareutil.compareCreatedOn(item1.auditDetails, item2.auditDetails);
  if (createdOnCompareResult !== 0) return createdOnCompareResult;

  const nameCompareResult = item1.name.localeCompare(item2.name);
  if (nameCompareResult !== 0) return nameCompareResult;

  return 0;
};

/**
 * status hierarchy   enable > disable > deleted
 * status1 < status2 => -1
 * status1 > status2 => 1
 *
 * @param status1
 * @param status2
 * @returns
 */
const compareStatus = (status1: ConfigStatus, status2: ConfigStatus) => {
  if (status1 === status2) {
    return 0;
  }
  if (status1 === ConfigStatus.ENABLE) {
    return 1;
  }
  if (status1 === ConfigStatus.DISABLE && status2 === ConfigStatus.DELETED) {
    return 1;
  }
  return -1;
};

const getValidatedStatus = (val: string) => {
  if (val !== ConfigStatus.ENABLE && val !== ConfigStatus.DISABLE && val !== ConfigStatus.DELETED) {
    throw new ValidationError([{ path: ConfigResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }
  return val as ConfigStatus;
};

const getValidatedConfigStatusFromQuery = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("getValidatedConfigStatusFromQuery", loggerBase);
  let statusValues = event.multiValueQueryStringParameters?.status?.map(getValidatedStatus);
  if (!statusValues?.length) {
    statusValues = [ConfigStatus.ENABLE, ConfigStatus.DISABLE];
  }

  logger.info("query parameter, config statuses =", statusValues);

  return statusValues;
};
