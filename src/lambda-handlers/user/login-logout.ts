import { APIGatewayProxyEvent } from "aws-lambda";
import { getSignedToken } from "../auth";
import { AuthRole } from "../common";
import { UnAuthorizedError, apiGatewayHandlerWrapper, RequestBodyContentType, InvalidField, ValidationError } from "../apigateway";
import { LoggerBase, getLogger, utils, validations, dbutil } from "../utils";
import {
  _logger,
  _userTableName,
  _userEmailGsiName,
  getEmailGsiPk,
  UserResourcePath,
  ErrorMessage,
  getTokenTablePk,
  getValidatedUserId,
} from "./base-config";
import { ApiUserResource, DbItemUser, DbItemToken } from "./resource-type";
import { verify } from "./pcrypt";

const loginHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("login", _logger);
  const req = getValidatedRequestForLogin(event, logger);
  const cmdInput = {
    TableName: _userTableName,
    IndexName: _userEmailGsiName,
    KeyConditionExpression: "E_GSI_PK = :pk",
    ExpressionAttributeValues: {
      ":pk": getEmailGsiPk(req.emailId as string),
    },
  };
  const gsioutput = await dbutil.queryOnce(cmdInput, logger);
  logger.info("getItem by EmailId");
  if (!gsioutput.Count || !gsioutput.Items || !gsioutput.Items.length) {
    throw new UnAuthorizedError(UserResourcePath.EMAILID + " " + ErrorMessage.INCORRECT_VALUE);
  }

  const getcmdInput = {
    TableName: _userTableName,
    Key: { PK: gsioutput.Items[0].PK },
  };
  const output = await dbutil.getItem(getcmdInput, logger);
  logger.log("getItem by UserDetail PK");
  const dbDetailsItem = output.Item as DbItemUser;
  const isMatched = await verify(req.password as string, dbDetailsItem.details.phash);
  if (!isMatched) {
    throw new UnAuthorizedError(UserResourcePath.PASSWORD + " " + ErrorMessage.INCORRECT_VALUE);
  }

  const accessTokenObj = await getSignedToken(dbDetailsItem.details.id, AuthRole.PRIMARY);
  const dbTokenItem: DbItemToken = {
    PK: getTokenTablePk(dbDetailsItem.details.id),
    ExpiresAt: accessTokenObj.getExpiresAt().toSeconds(),
    details: {
      iat: accessTokenObj.iat,
      tokenExpiresAt: accessTokenObj.getExpiresAt().toMillis(),
    },
  };
  const putcmdInput = {
    TableName: _userTableName,
    Item: dbTokenItem,
  };
  const updateResult = await dbutil.putItem(putcmdInput, logger);
  logger.info("updateResult", "accessTokenObj", accessTokenObj);

  return {
    accessToken: accessTokenObj.token,
    expiresIn: accessTokenObj.expiresIn(),
  };
};
export const login = apiGatewayHandlerWrapper(loginHandler, RequestBodyContentType.JSON);

export const logout = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("logout", _logger);
  const userId = getValidatedUserId(event);
  logger.info("received request for userId", userId);
  const delCmdInput = {
    TableName: _userTableName,
    Key: { PK: getTokenTablePk(userId) },
  };
  const updateResult = await dbutil.deleteItem(delCmdInput, logger);
  logger.info("deleted token");
  return null;
});

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
