import { APIGatewayProxyEvent } from "aws-lambda";
import { InvalidField, RequestBodyContentType, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import { utils, validations, AuditDetailsType, getLogger, LoggerBase, dbutil } from "../utils";
import { DbUserDetails, ApiUserResource, DbUserDetailItem } from "./resource-type";
import { encrypt, verify } from "./pcrypt";
import {
  ErrorMessage,
  UserResourcePath,
  _logger,
  _userEmailGsiName,
  _userTableName,
  getDetailsTablePk,
  getEmailGsiPk,
  getValidatedUserId,
} from "./base-config";
import { caching } from "cache-manager";

const userDetailsMemoryCache = caching("memory", {
  max: 5,
  ttl: 5 * 60 * 1000,
});

export const getDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getDetails", _logger);
  const userId = getValidatedUserId(event);
  const output = await dbutil.ddbClient.get({
    TableName: _userTableName,
    Key: { PK: getDetailsTablePk(userId) },
  });
  logger.info("db result", output);
  if (!output.Item) {
    throw new ValidationError([{ message: ErrorMessage.UNKNOWN_USER, path: UserResourcePath.USER }]);
  }
  const dbDetails: DbUserDetails = output.Item.details;
  const result = {
    firstName: dbDetails.firstName,
    lastName: dbDetails.lastName,
    emailId: dbDetails.emailId,
  };
  return result;
});

const updateDetailsHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("updateDetails", _logger);
  const userId = getValidatedUserId(event);
  const req = getValidatedRequestForUpdateDetails(event, logger);
  const output = await dbutil.ddbClient.get({
    TableName: _userTableName,
    Key: { PK: getDetailsTablePk(userId) },
  });
  logger.info("getUserDetails", output);
  if (!output.Item) {
    throw new ValidationError([{ message: ErrorMessage.UNKNOWN_USER, path: UserResourcePath.USER }]);
  }
  const dbDetails = output.Item.details as DbUserDetails;
  let apiToDbDetails: DbUserDetails;

  if (req.password) {
    const isMatched = await verify(req.password as string, dbDetails.phash);
    if (!isMatched) {
      throw new ValidationError([{ path: UserResourcePath.PASSWORD, message: ErrorMessage.INCORRECT_VALUE }]);
    }
    apiToDbDetails = {
      id: dbDetails.id,
      firstName: dbDetails.firstName,
      lastName: dbDetails.lastName,
      emailId: dbDetails.emailId,
      phash: await encrypt(req.newPassword as string),
      auditDetails: utils.updateAuditDetails(dbDetails.auditDetails, dbDetails.id) as AuditDetailsType,
      status: dbDetails.status,
    };
  } else {
    apiToDbDetails = {
      id: dbDetails.id,
      firstName: req.firstName as string,
      lastName: req.lastName as string,
      emailId: dbDetails.emailId,
      phash: dbDetails.phash,
      auditDetails: utils.updateAuditDetails(dbDetails.auditDetails, dbDetails.id) as AuditDetailsType,
      status: dbDetails.status,
    };
  }

  const dbItem: DbUserDetailItem = {
    PK: getDetailsTablePk(userId),
    E_GSI_PK: getEmailGsiPk(dbDetails.emailId),
    details: apiToDbDetails,
  };
  const updateResult = await dbutil.ddbClient.put({
    TableName: _userTableName,
    Item: dbItem,
  });
  logger.debug("updateResult", updateResult);
  return null;
};
export const updateDetails = apiGatewayHandlerWrapper(updateDetailsHandler, RequestBodyContentType.JSON);

/**
 * Retrieve json body from event and validate resouc for update details.
 *
 * @param event get json body and validate
 * @returns
 */
const getValidatedRequestForUpdateDetails = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("validateRequest", loggerBase);
  const req: ApiUserResource | null = utils.getJsonObj(event.body as string);
  logger.info("request=", req);

  if (!req) {
    throw new ValidationError([{ path: UserResourcePath.REQUEST, message: ErrorMessage.MISSING_VALUE }]);
  }
  const invalidFields: InvalidField[] = [];
  if (req.password || req.newPassword) {
    if (req.firstName) {
      invalidFields.push({ path: UserResourcePath.FIRSTNAME, message: ErrorMessage.INCORRECT_VALUE });
    }
    if (req.lastName) {
      invalidFields.push({ path: UserResourcePath.LASTNAME, message: ErrorMessage.INCORRECT_VALUE });
    }
    if (!validations.isValidPassword(req.password)) {
      invalidFields.push({ path: UserResourcePath.PASSWORD, message: ErrorMessage.INCORRECT_VALUE });
    }
    if (!validations.isValidPassword(req.newPassword)) {
      invalidFields.push({ path: UserResourcePath.NEWPASSWORD, message: ErrorMessage.INCORRECT_FORMAT });
    }
    if (req.password === req.newPassword) {
      invalidFields.push({ path: UserResourcePath.NEWPASSWORD, message: ErrorMessage.INCORRECT_VALUE });
    }
  } else {
    if (req.password) {
      invalidFields.push({ path: UserResourcePath.PASSWORD, message: ErrorMessage.INCORRECT_VALUE });
    }
    if (req.newPassword) {
      invalidFields.push({ path: UserResourcePath.NEWPASSWORD, message: ErrorMessage.INCORRECT_VALUE });
    }
    if (req.firstName && !validations.isValidName(req.firstName)) {
      invalidFields.push({ path: UserResourcePath.FIRSTNAME, message: ErrorMessage.INCORRECT_FORMAT });
    }
    if (req.lastName && !validations.isValidName(req.lastName)) {
      invalidFields.push({ path: UserResourcePath.LASTNAME, message: ErrorMessage.INCORRECT_FORMAT });
    }
  }
  logger.info("invalidFields", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  return req;
};

export const getUserDetailsById = async (userId: string) => {
  const userDetailCache = await userDetailsMemoryCache;
  const details = userDetailCache.wrap(userId, async () => {
    const logger = getLogger("getUserDetailsById", _logger);
    if (!userId || !validations.isValidUuid(userId)) {
      return null;
    }
    const output = await dbutil.ddbClient.get({
      TableName: _userTableName,
      Key: { PK: getDetailsTablePk(userId) },
    });
    logger.info("db result", output);
    if (!output.Item) {
      return null;
    }
    const dbDetails: DbUserDetails = output.Item.details;
    return {
      id: dbDetails.id,
      firstName: dbDetails.firstName,
      lastName: dbDetails.lastName,
      emailId: dbDetails.emailId,
      status: dbDetails.status,
    } as DbUserDetails;
  });
  return await details;
};
