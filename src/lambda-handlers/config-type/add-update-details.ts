import { APIGatewayProxyEvent } from "aws-lambda";
import {
  InvalidField,
  JSONObject,
  RequestBodyContentType,
  UnAuthorizedError,
  ValidationError,
  apiGatewayHandlerWrapper,
  convertToCreatedResponse,
} from "../apigateway";
import { getAuthorizeUser } from "../user";
import { AuditDetailsType, LoggerBase, dbutil, getLogger, utils, validations } from "../utils";
import {
  CONFIG_DESCRIPTION_MAX_LENGTH,
  CONFIG_NAME_VALUE_MAX_LENGTH,
  CONFIG_NAME_VALUE_MIN_LENGTH,
  ConfigResourcePath,
  ErrorMessage,
  MAX_ALLOWED_TAGS,
  _configTypeTableName,
  _logger,
  getBelongsToGsiPk,
  getBelongsToGsiSk,
  getDetailsTablePk,
  getValidatedBelongsTo,
  BelongsTo,
  ConfigStatus,
} from "./base-config";
import { ApiConfigTypeResource, DbConfigTypeDetails, DbItemConfigType } from "./resource-type";
import { v4 as uuidv4 } from "uuid";
import { getCurrencyByCountry } from "../settings";
import { CountryCurrencyRelation } from "../settings/currency-profile";

const addUpdateDetailsHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("addUpdateDetails", _logger);

  const belongsTo = getValidatedBelongsTo(event, logger);

  const req = await getValidatedRequestForUpdateDetails(event, logger);
  const authUser = getAuthorizeUser(event);
  // find db record if any.
  // perform the add or update
  let existingDbItem: DbItemConfigType | null = null;
  if (req.id) {
    const cmdInput = {
      TableName: _configTypeTableName,
      Key: { PK: getDetailsTablePk(req.id) },
    };
    const output = await dbutil.getItem(cmdInput, logger);

    logger.info("retrieved config from DB");
    if (output.Item) {
      existingDbItem = output.Item as DbItemConfigType;
      // validate user access to config details
      const gsiPkForReq = getBelongsToGsiPk(null, logger, authUser.userId, belongsTo);
      if (gsiPkForReq !== existingDbItem.UB_GSI_PK) {
        // not same user
        throw new UnAuthorizedError("not authorized to update config type details");
      }
    }
  }
  const auditDetails = utils.updateAuditDetailsFailIfNotExists(existingDbItem?.details.auditDetails, authUser);
  const configId = existingDbItem?.details.id || uuidv4();

  const apiToDbDetails: DbConfigTypeDetails = {
    id: configId,
    name: req.name,
    value: req.value,
    belongsTo: belongsTo,
    status: req.status,
    description: req.description,
    tags: req.tags,
    color: req.color,
    auditDetails: auditDetails as AuditDetailsType,
  };

  const dbItem: DbItemConfigType = {
    PK: getDetailsTablePk(configId),
    UB_GSI_PK: getBelongsToGsiPk(event, logger),
    UB_GSI_SK: getBelongsToGsiSk(apiToDbDetails.status),
    details: apiToDbDetails,
  };

  const cmdInput = {
    TableName: _configTypeTableName,
    Item: dbItem,
  };
  const updateResult = await dbutil.putItem(cmdInput, logger);
  logger.debug("Result updated");

  const apiAuditDetails = await utils.parseAuditDetails(apiToDbDetails.auditDetails, authUser.userId, authUser);
  let currencyCountryResource: JSONObject = {};
  if (belongsTo === BelongsTo.CurrencyProfile) {
    logger.info("special type of belongsTo,", belongsTo, ". so adding additional details to response");

    const currencyCountryData = await getCurrencyByCountry(logger);
    const matching = currencyCountryData.find((ccd) => ccd.country.code === req.name && ccd.currency.code === req.value) as CountryCurrencyRelation;
    currencyCountryResource.country = {
      name: matching.country.name,
      code: matching.country.code,
    };
    currencyCountryResource.currency = {
      name: matching.currency.name,
      code: matching.currency.code,
      symbol: matching.currency.symbol,
    };
  }
  const resource = {
    ...req,
    id: apiToDbDetails.id,
    belongsTo: apiToDbDetails.belongsTo,
    auditDetails: apiAuditDetails,
    ...currencyCountryResource,
  };

  const result = resource as unknown as JSONObject;
  if (!existingDbItem) {
    return convertToCreatedResponse(result);
  }
  return result;
};
export const addUpdateDetails = apiGatewayHandlerWrapper(addUpdateDetailsHandler, RequestBodyContentType.JSON);

const getValidatedRequestForUpdateDetails = async (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("validateRequest", loggerBase);

  const req: ApiConfigTypeResource | null = utils.getJsonObj(event.body as string);
  logger.info("request =", req);

  if (!req) {
    throw new ValidationError([{ path: ConfigResourcePath.REQUEST, message: ErrorMessage.MISSING_VALUE }]);
  }

  const belongsTo = getValidatedBelongsTo(event, logger);
  const invalidFields: InvalidField[] = [];
  if (!validations.isValidName(req.name, CONFIG_NAME_VALUE_MAX_LENGTH, CONFIG_NAME_VALUE_MIN_LENGTH)) {
    invalidFields.push({ path: ConfigResourcePath.NAME, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (!validations.isValidName(req.value, CONFIG_NAME_VALUE_MAX_LENGTH, CONFIG_NAME_VALUE_MIN_LENGTH)) {
    invalidFields.push({ path: ConfigResourcePath.VALUE, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.status !== ConfigStatus.ENABLE && req.status !== ConfigStatus.DISABLE && req.status !== ConfigStatus.DELETED) {
    invalidFields.push({ path: ConfigResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE });
  }

  if (req.description && !validations.isValidDescription(req.description, CONFIG_DESCRIPTION_MAX_LENGTH)) {
    invalidFields.push({ path: ConfigResourcePath.DESCRIPTION, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.color && !validations.isValidColor(req.color)) {
    invalidFields.push({ path: ConfigResourcePath.COLOR, message: ErrorMessage.INCORRECT_FORMAT });
  }

  if (req.tags.length > MAX_ALLOWED_TAGS) {
    invalidFields.push({ path: ConfigResourcePath.TAGS, message: ErrorMessage.LIMIT_EXCEEDED });
  }
  const inValidTags = req.tags.filter((tag) => !validations.isValidTag(tag));
  if (inValidTags.length > 0) {
    logger.info("inValidTags =", inValidTags);
    invalidFields.push({ path: ConfigResourcePath.TAGS, message: "invalid tags [" + inValidTags + "]" });
  }

  if (req.id && !validations.isValidUuid(req.id)) {
    invalidFields.push({ path: ConfigResourcePath.ID, message: ErrorMessage.INCORRECT_FORMAT });
  }

  if (belongsTo === BelongsTo.CurrencyProfile) {
    const currencyCountryData = await getCurrencyByCountry(logger);
    const foundCntry = currencyCountryData.find((ccd) => ccd.country.code === req.name);
    const foundCurr = currencyCountryData.find((ccd) => ccd.currency.code === req.value);
    if (!foundCntry) {
      invalidFields.push({ path: ConfigResourcePath.COUNTRY, message: ErrorMessage.INCORRECT_VALUE });
    }
    if (!foundCurr) {
      invalidFields.push({ path: ConfigResourcePath.CURRENCY, message: ErrorMessage.INCORRECT_VALUE });
    }
  }

  logger.info("invalidFields =", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  return req;
};
