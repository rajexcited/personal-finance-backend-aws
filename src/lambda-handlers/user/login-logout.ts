import { APIGatewayProxyEvent } from "aws-lambda";
import { Role, getSignedToken } from "../auth";
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
import { ApiUserResource, DbUserDetailItem, DbUserTokenItem } from "./resource-type";
import { verify } from "./pcrypt";

const loginHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("login", _logger);
  const req = getValidatedRequestForLogin(event, logger);
  const gsioutput = await dbutil.ddbClient.query({
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

  const output = await dbutil.ddbClient.get({
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
    ExpiresAt: accessTokenObj.getExpiresAt().toSeconds(),
    details: {
      iat: accessTokenObj.iat,
      tokenExpiresAt: accessTokenObj.getExpiresAt().toMillis(),
    },
  };
  const updateResult = await dbutil.ddbClient.put({
    TableName: _userTableName,
    Item: dbTokenItem,
  });
  logger.info("updateResult", updateResult, "accessTokenObj", accessTokenObj);

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
  const updateResult = await dbutil.ddbClient.delete({
    TableName: _userTableName,
    Key: { PK: getTokenTablePk(userId) },
  });
  logger.info("updateResult", updateResult);
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
