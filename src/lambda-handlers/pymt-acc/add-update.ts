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
import {
  ErrorMessage,
  NAME_MIN_LENGTH,
  PymtAccResourcePath,
  PymtAccStatus,
  SHORTNAME_MAX_LENGTH,
  _logger,
  _pymtAccTableName,
  _userIdStatusShortnameIndex,
  getDetailsTablePk,
  getUserIdStatusShortnameGsiPk,
  getUserIdStatusShortnameGsiSk,
} from "./base-config";
import { LoggerBase, dbutil, getLogger, utils, validations } from "../utils";
import { getAuthorizeUser, getValidatedUserId } from "../user";
import { ApiPaymentAccountResource, DbPaymentAccountDetails, DbItemPymtAcc } from "./resource-type";
import { v4 as uuidv4 } from "uuid";
import { isValidAccountIdNum, isValidInstitutionName } from "./validate";
import { ConfigBelongsTo, getDefaultCurrencyProfile, isConfigIdExists } from "../config-type";
import { GetCommandInput, QueryCommandInput } from "@aws-sdk/lib-dynamodb";

const addUpdateDetailsHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("addUpdateDetails", _logger);

  const req = await getValidatedRequestForUpdateDetails(event, logger);
  const authUser = getAuthorizeUser(event);
  // find db record if any.
  // perform the add or update
  const currencyProfile = await getDefaultCurrencyProfile(authUser.userId, logger);
  let existingDbItem: DbItemPymtAcc | null = null;
  if (req.id) {
    const cmdInput: GetCommandInput = {
      TableName: _pymtAccTableName,
      Key: { PK: getDetailsTablePk(req.id) },
    };

    const output = await dbutil.getItem(cmdInput, logger);

    logger.info("retrieved pymt account from DB");
    if (output.Item) {
      existingDbItem = output.Item as DbItemPymtAcc;
      // validate user access to config details
      const gsiPkForReq = getUserIdStatusShortnameGsiPk(authUser.userId, PymtAccStatus.ENABLE, currencyProfile);
      if (gsiPkForReq !== existingDbItem.UP_GSI_PK) {
        // not same user or status is deleted
        throw new UnAuthorizedError("not authorized to update payment type details");
      }
    } else {
      const queryCmdInput: QueryCommandInput = {
        TableName: _pymtAccTableName,
        IndexName: _userIdStatusShortnameIndex,
        KeyConditionExpression: "UP_GSI_PK = :pkv and UP_GSI_SK = :skv",
        ExpressionAttributeValues: {
          ":pkv": getUserIdStatusShortnameGsiPk(authUser.userId, PymtAccStatus.ENABLE, currencyProfile),
          ":skv": getUserIdStatusShortnameGsiSk(req.shortName),
        },
      };
      const result = await dbutil.queryOnce(queryCmdInput, logger);
      if (result.Items?.length) {
        throw new ValidationError([{ path: PymtAccResourcePath.SHORTNAME, message: ErrorMessage.DUPLICATE_VALUE }]);
      }
    }
  }

  const pymtAccId = existingDbItem?.details.id || uuidv4();
  const auditDetails = utils.updateAuditDetailsFailIfNotExists(existingDbItem?.details.auditDetails, authUser);

  const apiToDbDetails: DbPaymentAccountDetails = {
    id: pymtAccId,
    shortName: req.shortName,
    accountIdNum: req.accountIdNum || "",
    institutionName: req.institutionName || "",
    status: existingDbItem?.details.status || PymtAccStatus.ENABLE,
    description: req.description,
    tags: req.tags,
    typeId: req.typeId,
    auditDetails: auditDetails,
    currencyProfileId: currencyProfile.id,
  };

  const dbItem: DbItemPymtAcc = {
    PK: getDetailsTablePk(pymtAccId),
    UP_GSI_PK: getUserIdStatusShortnameGsiPk(authUser.userId, apiToDbDetails.status, currencyProfile),
    UP_GSI_SK: getUserIdStatusShortnameGsiSk(req.shortName),
    details: apiToDbDetails,
  };

  const cmdInput = {
    TableName: _pymtAccTableName,
    Item: dbItem,
  };
  const updateResult = await dbutil.putItem(cmdInput, logger);
  logger.debug("Result updated");

  const apiAuditDetails = await utils.parseAuditDetails(apiToDbDetails.auditDetails, authUser.userId, getAuthorizeUser(event));

  const resource: ApiPaymentAccountResource = {
    ...req,
    id: apiToDbDetails.id,
    status: apiToDbDetails.status,
    auditDetails: apiAuditDetails,
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

  const req: ApiPaymentAccountResource | null = utils.getJsonObj(event.body as string);
  logger.info("request =", req);

  if (!req) {
    throw new ValidationError([{ path: PymtAccResourcePath.REQUEST, message: ErrorMessage.MISSING_VALUE }]);
  }

  const invalidFields: InvalidField[] = [];
  if (!validations.isValidName(req.shortName, SHORTNAME_MAX_LENGTH, NAME_MIN_LENGTH)) {
    invalidFields.push({ path: PymtAccResourcePath.SHORTNAME, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.status && req.status === PymtAccStatus.DELETED) {
    invalidFields.push({ path: PymtAccResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE });
  }

  if (req.description && !validations.isValidDescription(req.description)) {
    invalidFields.push({ path: PymtAccResourcePath.DESCRIPTION, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.id && !validations.isValidUuid(req.id)) {
    invalidFields.push({ path: PymtAccResourcePath.ID, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.accountIdNum && !isValidAccountIdNum(req.accountIdNum)) {
    invalidFields.push({ path: PymtAccResourcePath.ACCOUNT_ID_NAME, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.institutionName && !isValidInstitutionName(req.institutionName)) {
    invalidFields.push({ path: PymtAccResourcePath.INSTITUTION_NAME, message: ErrorMessage.INCORRECT_FORMAT });
  }
  const userId = getValidatedUserId(event);
  const isValidPymtAccId = await isConfigIdExists(req.typeId, ConfigBelongsTo.PaymentAccountType, userId, logger);
  if (!isValidPymtAccId) {
    invalidFields.push({ path: PymtAccResourcePath.TYPE_ID, message: ErrorMessage.INCORRECT_VALUE });
  }

  if (req.tags.length > validations.DEFAULT_MAX_ALLOWED_TAGS) {
    invalidFields.push({ path: PymtAccResourcePath.TAGS, message: ErrorMessage.LIMIT_EXCEEDED });
  }
  const inValidTags = req.tags.filter((tag) => !validations.isValidTag(tag));
  if (!validations.areTagsValid(req.tags)) {
    logger.info("inValidTags =", inValidTags);
    invalidFields.push({ path: PymtAccResourcePath.TAGS, message: "invalid tags [" + inValidTags + "]" });
  }

  logger.info("invalidFields =", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  return req;
};
