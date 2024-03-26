import { APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import {
  InvalidField,
  RequestBodyContentType,
  UnAuthorizedError,
  ValidationError,
  apiGatewayHandlerWrapper,
} from "../handler-wrapper";
import { utils, validations, AuditDetailsType, getLogger, LoggerBase } from "../utils";
import { DbUserDetails, ApiUserResource, DbUserDetailItem, DbUserTokenItem } from "./user-type";
import { getSignedToken, Role } from "../auth";
import { encrypt, verify } from "./pcrypt";

/**
 * DynamoDB code example
 * https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html
 */

const _ddbClient = DynamoDBDocument.from(new DynamoDBClient(), utils.DdbTranslateConfig);
const _userTableName = process.env.USER_TABLE_NAME as string;
const _userEmailGsiName = process.env.USER_EMAIL_GSI_NAME as string;
const _logger = getLogger("user");

enum ErrorMessage {
  UNKNOWN_USER = "unknown user",
  INCORRECT_VALUE = "incorrect value",
  INCORRECT_FORMAT = "incorrect format",
  MISSING_VALUE = "missing value",
  EMAIL_ALREADY_EXISTS = "the user with emailId already exists",
}

enum UserResourcePath {
  USER = "user",
  REQUEST = "request",
  NEWPASSWORD = "newPassword",
  PASSWORD = "password",
  FIRSTNAME = "firstName",
  LASTNAME = "lastName",
  EMAILID = "emailId",
}

export const getDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getDetails", _logger);
  const userId = getValidatedUserId(event);
  const output = await _ddbClient.get({
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
  const output = await _ddbClient.get({
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
      auditDetails: utils.updateAuditDetails(dbDetails.auditDetails, dbDetails) as AuditDetailsType,
    };
  } else {
    apiToDbDetails = {
      id: dbDetails.id,
      firstName: req.firstName as string,
      lastName: req.lastName as string,
      emailId: dbDetails.emailId,
      phash: dbDetails.phash,
      auditDetails: utils.updateAuditDetails(dbDetails.auditDetails, dbDetails) as AuditDetailsType,
    };
  }

  const dbItem: DbUserDetailItem = {
    PK: getDetailsTablePk(userId),
    E_GSI_PK: getEmailGsiPk(dbDetails.emailId),
    details: apiToDbDetails,
  };
  const updateResult = await _ddbClient.put({
    TableName: _userTableName,
    Item: dbItem,
  });
  logger.debug("updateResult", updateResult);
  return null;
};
export const updateDetails = apiGatewayHandlerWrapper(updateDetailsHandler, RequestBodyContentType.JSON);

export const signupHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("signup", _logger);
  const req = await getValidatedRequestForSignup(event, logger);
  const apiToDbDetails: DbUserDetails = {
    id: uuidv4(),
    emailId: req.emailId as string,
    firstName: req.firstName as string,
    lastName: req.lastName as string,
    phash: await encrypt(req.password as string),
    auditDetails: { createdBy: "", createdOn: "", updatedBy: "", updatedOn: "" },
  };
  const newauditDetails = utils.updateAuditDetails(apiToDbDetails.auditDetails, apiToDbDetails) as AuditDetailsType;
  const dbDetailItem: DbUserDetailItem = {
    PK: getDetailsTablePk(apiToDbDetails.id),
    E_GSI_PK: getEmailGsiPk(apiToDbDetails.emailId),
    details: { ...apiToDbDetails, auditDetails: newauditDetails },
  };
  logger.info("dbDetailItem to be updated", dbDetailItem);

  await initializeUserConfigurations(apiToDbDetails);

  const accessTokenObj = await getSignedToken(apiToDbDetails.id, Role.PRIMARY);
  const dbTokenItem: DbUserTokenItem = {
    PK: getTokenTablePk(apiToDbDetails.id),
    tokenExpiresAt: accessTokenObj.expiresAt.getTime(),
    ExpiresAt: utils.getEpochSeconds(accessTokenObj.expiresAt),
  };

  let requestItems: any = {};
  requestItems[_userTableName] = [{ PutRequest: { Item: dbDetailItem } }, { PutRequest: { Item: dbTokenItem } }];
  const batchWriteResults = await _ddbClient.batchWrite({ RequestItems: requestItems });
  logger.debug("batchWriteResults", batchWriteResults);

  return {
    accessToken: accessTokenObj.token,
    expiresIn: accessTokenObj.expiresIn,
  };
};
export const signup = apiGatewayHandlerWrapper(signupHandler, RequestBodyContentType.JSON);

const loginHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("login", _logger);
  const req = getValidatedRequestForLogin(event, logger);
  const gsioutput = await _ddbClient.query({
    TableName: _userTableName,
    IndexName: _userEmailGsiName,
    KeyConditionExpression: "E_GSI_PK = :pk",
    ExpressionAttributeValues: {
      ":pk": getEmailGsiPk(req.emailId as string),
    },
  });
  logger.info("getItem by EmailId, gsi output", gsioutput);
  if (!gsioutput.Count || !gsioutput.Items || !gsioutput.Items.length) {
    throw new UnAuthorizedError(UserResourcePath.EMAILID + " " + ErrorMessage.INCORRECT_VALUE);
  }

  const output = await _ddbClient.get({
    TableName: _userTableName,
    Key: { PK: gsioutput.Items[0].PK },
  });
  logger.log("getItem by UserDetail PK, output", output);
  const dbDetailsItem = output.Item as DbUserDetailItem;
  const isMatched = await verify(req.password as string, dbDetailsItem.details.phash);
  if (!isMatched) {
    throw new UnAuthorizedError(UserResourcePath.PASSWORD + " " + ErrorMessage.INCORRECT_VALUE);
  }

  const accessTokenObj = await getSignedToken(dbDetailsItem.details.id, Role.PRIMARY);
  const dbTokenItem: DbUserTokenItem = {
    PK: getTokenTablePk(dbDetailsItem.details.id),
    tokenExpiresAt: accessTokenObj.expiresAt.getTime(),
    ExpiresAt: utils.getEpochSeconds(accessTokenObj.expiresAt),
  };
  const updateResult = await _ddbClient.put({
    TableName: _userTableName,
    Item: dbTokenItem,
  });
  logger.info("updateResult", updateResult);

  return {
    accessToken: accessTokenObj.token,
    expiresIn: accessTokenObj.expiresIn,
  };
};
export const login = apiGatewayHandlerWrapper(loginHandler, RequestBodyContentType.JSON);

export const renewToken = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("renewToken", _logger);
  const userId = getValidatedUserId(event);
  const role = event.requestContext.authorizer?.role;

  const accessTokenObj = await getSignedToken(userId, role);
  const dbTokenItem: DbUserTokenItem = {
    PK: getTokenTablePk(userId),
    tokenExpiresAt: accessTokenObj.expiresAt.getTime(),
    ExpiresAt: accessTokenObj.expiresAt.getTime(),
  };
  const updateResult = await _ddbClient.put({
    TableName: _userTableName,
    Item: dbTokenItem,
  });
  logger.info("updateResult", updateResult);

  return {
    accessToken: accessTokenObj.token,
    expiresIn: accessTokenObj.expiresIn,
  };
});

export const logout = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("logout", _logger);
  const userId = getValidatedUserId(event);
  logger.info("received request for userId", userId);
  const updateResult = await _ddbClient.delete({
    TableName: _userTableName,
    Key: { PK: getTokenTablePk(userId) },
  });
  logger.info("updateResult", updateResult);
  return null;
});

export const getDetailsTablePk = (userId: string) => {
  return `userId#${userId}#details`;
};
export const getTokenTablePk = (userId: string) => {
  return `userId#${userId}#token`;
};
const getEmailGsiPk = (emailId: string) => {
  return `emailId#${emailId}`;
};

const getValidatedUserId = (event: APIGatewayProxyEvent) => {
  const userId = event.requestContext.authorizer?.principalId;
  if (!userId || !validations.isValidUuid(userId)) {
    throw new UnAuthorizedError("missing userId in authorizer");
  }
  return userId;
};

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

const getValidatedRequestForSignup = async (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("validateRequest", loggerBase);
  const req: ApiUserResource | null = utils.getJsonObj(event.body as string);
  logger.info("request=", req);

  if (!req) {
    throw new ValidationError([{ path: UserResourcePath.REQUEST, message: ErrorMessage.MISSING_VALUE }]);
  }
  const invalidFields: InvalidField[] = [];
  if (!validations.isValidPassword(req.password)) {
    const error = req.password ? ErrorMessage.INCORRECT_VALUE : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.PASSWORD, message: error });
  }
  if (!validations.isValidName(req.firstName)) {
    const error = req.firstName ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.FIRSTNAME, message: error });
  }
  if (!validations.isValidName(req.lastName)) {
    const error = req.lastName ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.LASTNAME, message: error });
  }
  if (!validations.isValidEmail(req.emailId)) {
    const error = req.emailId ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.EMAILID, message: error });
  }
  logger.info("invalidFields", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  const output = await _ddbClient.query({
    TableName: _userTableName,
    IndexName: _userEmailGsiName,
    KeyConditionExpression: "E_GSI_PK = :pk",
    ExpressionAttributeValues: {
      ":pk": getEmailGsiPk(req.emailId as string),
    },
  });
  logger.info("output=", output);

  // error if count value is greater than 0
  if (output.Count) {
    throw new ValidationError([{ path: UserResourcePath.EMAILID, message: ErrorMessage.EMAIL_ALREADY_EXISTS }]);
  }

  return req;
};

const getValidatedRequestForLogin = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("validateRequest", loggerBase);
  const req: ApiUserResource | null = utils.getJsonObj(event.body as string);
  logger.info("request=", req);
  if (!req) {
    throw new ValidationError([{ path: UserResourcePath.REQUEST, message: ErrorMessage.MISSING_VALUE }]);
  }

  const invalidFields: InvalidField[] = [];
  if (!validations.isValidPassword(req.password)) {
    const error = req.password ? ErrorMessage.INCORRECT_VALUE : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.PASSWORD, message: error });
  }
  if (!validations.isValidEmail(req.emailId)) {
    const error = req.emailId ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: UserResourcePath.EMAILID, message: error });
  }
  logger.info("invalidFields", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  return req;
};

/**
 * call db to create default list of expense categories, payment account type, payment account
 *
 * @param userDetails
 */
const initializeUserConfigurations = async (userDetails: DbUserDetails) => {
  //todo
  // throw new Error("Not implemented");
};
