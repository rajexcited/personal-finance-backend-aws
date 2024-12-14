import { APIGatewayProxyEvent } from "aws-lambda";
import { InvalidError, InvalidField, JSONObject, RequestBodyContentType, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import { utils, validations, getLogger, LoggerBase, dbutil, dateutil } from "../utils";
import { DbUserDetails, ApiUserResource, DbItemUser, DbUserStatus, ApiUserAccountStatus } from "./resource-type";
import { encrypt, verifyCurrPrev } from "./pcrypt";
import {
  ErrorMessage,
  UserResourcePath,
  _logger,
  _userEmailGsiName,
  _userTableName,
  getAuthorizeUser,
  getDetailsTablePk,
  getEmailGsiPk,
  getValidatedUserId,
} from "./base-config";
import { caching } from "cache-manager";
import ms from "ms";

const userDetailsMemoryCache = caching("memory", {
  max: 5,
  ttl: ms("5 min"),
});

const DELETE_USER_EXPIRES_IN_SEC = Number(process.env.DELETE_USER_EXPIRES_IN_SEC);

export const getDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getDetails", _logger);
  const userId = getValidatedUserId(event);
  const cmdInput = {
    TableName: _userTableName,
    Key: { PK: getDetailsTablePk(userId) },
  };
  const output = await dbutil.getItem(cmdInput, logger);
  logger.info("retrieved user item result");
  if (!output.Item) {
    throw new ValidationError([{ message: ErrorMessage.UNKNOWN_USER, path: UserResourcePath.USER }]);
  }
  const dbDetails: DbUserDetails = output.Item.details;
  const result: ApiUserResource = {
    firstName: dbDetails.firstName,
    lastName: dbDetails.lastName,
    emailId: dbDetails.emailId,
    status: convertUserStatusDbtoApi(dbDetails),
  };
  return result as unknown as JSONObject;
});

const updateDetailsHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("updateDetails", _logger);
  const authUser = getAuthorizeUser(event);
  const req = getValidatedRequestForUpdateDetails(event, logger);
  const getCmdInput = {
    TableName: _userTableName,
    Key: { PK: getDetailsTablePk(authUser.userId) },
  };
  const output = await dbutil.getItem(getCmdInput, logger);
  logger.info("getUserDetails", output);
  if (!output.Item) {
    throw new ValidationError([{ message: ErrorMessage.UNKNOWN_USER, path: UserResourcePath.USER }]);
  }
  const dbDetails = output.Item.details as DbUserDetails;
  let apiToDbDetails: DbUserDetails;

  if (req.password) {
    const matchedObj = await verifyCurrPrev(req.password as string, dbDetails.phash);
    if (!matchedObj.current && !matchedObj.previous) {
      throw new ValidationError([{ path: UserResourcePath.PASSWORD, message: ErrorMessage.INCORRECT_VALUE }]);
    }
    apiToDbDetails = {
      id: dbDetails.id,
      firstName: dbDetails.firstName,
      lastName: dbDetails.lastName,
      emailId: dbDetails.emailId,
      phash: await encrypt(req.newPassword as string),
      auditDetails: utils.updateAuditDetailsFailIfNotExists(dbDetails.auditDetails, authUser),
      status: dbDetails.status,
    };
  } else {
    apiToDbDetails = {
      id: dbDetails.id,
      firstName: req.firstName as string,
      lastName: req.lastName as string,
      emailId: dbDetails.emailId,
      phash: dbDetails.phash,
      auditDetails: utils.updateAuditDetailsFailIfNotExists(dbDetails.auditDetails, authUser),
      status: dbDetails.status,
    };
  }

  const dbItem: DbItemUser = {
    PK: getDetailsTablePk(authUser.userId),
    E_GSI_PK: getEmailGsiPk(dbDetails.emailId),
    details: apiToDbDetails,
  };
  const putCmdInput = {
    TableName: _userTableName,
    Item: dbItem,
  };
  const updateResult = await dbutil.putItem(putCmdInput, logger);

  return null;
};
export const updateDetails = apiGatewayHandlerWrapper(updateDetailsHandler, RequestBodyContentType.JSON);

export const deleteDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("deleteDetails", _logger);
  const authUser = getAuthorizeUser(event);
  const { emailIdHeader, passwordHeader } = getValidatedRequestHeaders(event, logger);

  const cmdInput = {
    TableName: _userTableName,
    Key: { PK: getDetailsTablePk(authUser.userId) },
  };
  const output = await dbutil.getItem(cmdInput, logger);
  logger.info("retrieved user item result");
  if (!output.Item) {
    throw new ValidationError([{ message: ErrorMessage.UNKNOWN_USER, path: UserResourcePath.USER }]);
  }
  const dbItem = output.Item as DbItemUser;
  const passwordValidObj = await verifyCurrPrev(passwordHeader, dbItem.details.phash);
  if ((!passwordValidObj.current && !passwordValidObj.previous) || dbItem.details.emailId !== emailIdHeader) {
    throw new ValidationError([{ path: UserResourcePath.REQUEST, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const dbAuditDetails = utils.updateAuditDetailsFailIfNotExists(dbItem.details.auditDetails, authUser);
  const deleteGracefulTimeInSec = Math.ceil(dateutil.addSeconds(new Date(), DELETE_USER_EXPIRES_IN_SEC + 1).getTime() / 1000);
  const deletingDbItem: DbItemUser = {
    PK: dbItem.PK,
    E_GSI_PK: dbItem.E_GSI_PK,
    ExpiresAt: deleteGracefulTimeInSec,
    details: {
      ...dbItem.details,
      status: DbUserStatus.DELETE_USER,
      auditDetails: dbAuditDetails,
    },
  };

  const deleteResult = await dbutil.putItem({ TableName: _userTableName, Item: deletingDbItem }, logger);
  logger.debug("user is marked for deletion");

  const deleteResponse: ApiUserResource = {
    emailId: deletingDbItem.details.emailId,
    firstName: deletingDbItem.details.firstName,
    lastName: deletingDbItem.details.lastName,
    status: ApiUserAccountStatus.DELETED_USER,
  };
  return deleteResponse as unknown as JSONObject;
});

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
  const detailsPromise = userDetailCache.wrap(userId, async () => {
    const logger = getLogger("getUserDetailsById", _logger);
    if (!userId || !validations.isValidUuid(userId)) {
      return null;
    }
    const cmdInput = {
      TableName: _userTableName,
      Key: { PK: getDetailsTablePk(userId) },
    };
    const output = await dbutil.getItem(cmdInput, logger);
    logger.info("retrieved user item ");
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
  return await detailsPromise;
};

const convertUserStatusDbtoApi = (dbDetails: DbUserDetails) => {
  let apiStatus;
  switch (dbDetails.status) {
    case DbUserStatus.ACTIVE_USER:
      apiStatus = ApiUserAccountStatus.ACTIVE_USER;
      break;
    case DbUserStatus.INACTIVE_USER:
      apiStatus = ApiUserAccountStatus.DEACTIVATED_USER;
      break;
    case DbUserStatus.DELETE_USER:
      apiStatus = ApiUserAccountStatus.DELETED_USER;
      break;
    default:
      throw new InvalidError("incorrect db user status, value = [" + dbDetails.status + "]");
  }
  return apiStatus;
};

const getValidatedRequestHeaders = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("validateRequest", loggerBase);
  const emailIdHeader = event.headers.emailid as string;
  const passwordHeader = event.headers.password as string;

  const invalidFields: InvalidField[] = [];
  if (!validations.isValidEmail(emailIdHeader)) {
    const error = emailIdHeader ? ErrorMessage.INCORRECT_VALUE : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.EMAILID, message: error });
  }
  if (!validations.isValidPassword(passwordHeader)) {
    const error = passwordHeader ? ErrorMessage.INCORRECT_VALUE : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.PASSWORD, message: error });
  }

  logger.info("invalidFields", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  return { emailIdHeader, passwordHeader };
};
