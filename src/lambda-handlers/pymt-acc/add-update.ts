import { APIGatewayProxyEvent } from "aws-lambda";
import { InvalidField, JSONObject, UnAuthorizedError, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import {
  ErrorMessage,
  NAME_MIN_LENGTH,
  PymtAccResourcePath,
  PymtAccStatus,
  SHORTNAME_MAX_LENGTH,
  _logger,
  _pymtAccTableName,
  getDetailsTablePk,
  getUserIdStatusShortnameGsiPk,
  getUserIdStatusShortnameGsiSk,
} from "./base-config";
import { AuditDetailsType, LoggerBase, dbutil, getLogger, utils, validations } from "../utils";
import { getAuthorizeUser, getValidatedUserId } from "../user";
import { ApiPaymentAccountResource, DbPaymentAccountDetails, DbItemPymtAcc } from "./resource-type";
import { v4 as uuidv4 } from "uuid";
import { isValidAccountIdNum, isValidInstitutionName } from "./validate";
import { isValidPaymentAccountTypeId } from "../config-type";

export const addUpdateDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("addUpdateDetails", _logger);

  const req = await getValidatedRequestForUpdateDetails(event, logger);
  const userId = getValidatedUserId(event);
  // find db record if any.
  // perform the add or update
  let pymtAccId: string | null = null;
  let auditDetails: AuditDetailsType | null = null;
  if (req.id) {
    const cmdInput = {
      TableName: _pymtAccTableName,
      Key: { PK: getDetailsTablePk(req.id) },
    };
    const output = await dbutil.getItem(cmdInput, logger);

    logger.info("retrieved pymt account from DB");
    if (output.Item) {
      const dbItem = output.Item as DbItemPymtAcc;
      // validate user access to config details
      const gsiPkForReq = getUserIdStatusShortnameGsiPk(userId, dbItem.details.status);
      if (gsiPkForReq !== dbItem.UP_GSI_PK) {
        // not same user
        throw new UnAuthorizedError("not authorized to update payment type details");
      }

      auditDetails = utils.updateAuditDetails(dbItem.details.auditDetails, userId);
      pymtAccId = dbItem.details.id;
    }
  }
  if (!pymtAccId) {
    pymtAccId = uuidv4();
  }
  if (!auditDetails) {
    auditDetails = utils.updateAuditDetails(null, userId);
  }

  const apiToDbDetails: DbPaymentAccountDetails = {
    id: pymtAccId,
    shortName: req.shortName,
    accountIdNum: req.accountIdNum || "",
    institutionName: req.institutionName || "",
    status: req.status,
    description: req.description,
    tags: req.tags,
    typeId: req.typeId,
    auditDetails: auditDetails as AuditDetailsType,
  };

  const dbItem: DbItemPymtAcc = {
    PK: getDetailsTablePk(pymtAccId),
    UP_GSI_PK: getUserIdStatusShortnameGsiPk(userId, apiToDbDetails.status),
    UP_GSI_SK: getUserIdStatusShortnameGsiSk(apiToDbDetails.shortName),
    details: apiToDbDetails,
  };

  const cmdInput = {
    TableName: _pymtAccTableName,
    Item: dbItem,
  };
  const updateResult = await dbutil.putItem(cmdInput, logger);
  logger.debug("Result updated");

  const apiAuditDetails = await utils.parseAuditDetails(apiToDbDetails.auditDetails, userId, getAuthorizeUser(event));

  const resource: ApiPaymentAccountResource = {
    ...req,
    id: apiToDbDetails.id,
    auditDetails: apiAuditDetails,
  };

  return resource as unknown as JSONObject;
});

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
  if (req.status !== PymtAccStatus.ENABLE) {
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
  const isValidPymtAccId = await isValidPaymentAccountTypeId(req.typeId, userId, logger);
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
