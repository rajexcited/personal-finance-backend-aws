import { APIGatewayProxyEvent } from "aws-lambda";
import { getSignedToken } from "../auth";
import { AuthRole } from "../common";
import { UnAuthorizedError, apiGatewayHandlerWrapper, RequestBodyContentType, InvalidField, ValidationError, JSONObject, HTTP_STATUS_CODE } from "../apigateway";
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
  getPlatForm,
  getBrowser,
  getUserAgent,
  getBrowserVersion,
  getDeviceType,
  getCity,
  getCountryCode,
  getState,
  getTokenGsiPk,
  getAuthorizeUser
} from "./base-config";
import { ApiUserResource, DbItemUser, DbItemToken, AuthorizeUser } from "./resource-type";
import { encrypt, initiate, verifyCurrPrev } from "./pcrypt";
import { DeleteCommandInput, GetCommandInput } from "@aws-sdk/lib-dynamodb";
import { ReturnValue } from "@aws-sdk/client-dynamodb";

const loginHandler = async (event: APIGatewayProxyEvent) => {
  initiate();
  const logger = getLogger("login", _logger);
  const req = getValidatedRequestForLogin(event, logger);
  const cmdInput = {
    TableName: _userTableName,
    IndexName: _userEmailGsiName,
    KeyConditionExpression: "E_GSI_PK = :pk",
    ExpressionAttributeValues: {
      ":pk": getEmailGsiPk(req)
    }
  };
  const gsioutput = await dbutil.queryOnce(cmdInput, logger, dbutil.CacheAction.FROM_CACHE);
  logger.info("getItem by EmailId");
  if (!gsioutput?.Count || !gsioutput.Items || !gsioutput.Items.length) {
    throw new UnAuthorizedError(UserResourcePath.EMAILID + " " + ErrorMessage.INCORRECT_VALUE);
  }

  const getcmdInput = {
    TableName: _userTableName,
    Key: { PK: gsioutput.Items[0].PK }
  };
  const output = await dbutil.getItem(getcmdInput, logger, dbutil.CacheAction.FROM_CACHE);
  const dbDetailsItem = output?.Item as DbItemUser;
  const matchedObj = await verifyCurrPrev(req.password as string, dbDetailsItem.details.phash);
  if (!matchedObj.current && !matchedObj.previous) {
    throw new UnAuthorizedError(UserResourcePath.PASSWORD + " " + ErrorMessage.INCORRECT_VALUE);
  }

  const transactionWriter = new dbutil.TransactionWriter(logger);

  if (matchedObj.previous) {
    // re-encrypt the password and save new
    const phash = await encrypt(req.password as string);

    const primaryUser: AuthorizeUser = {
      role: AuthRole.PRIMARY,
      userId: dbDetailsItem.details.id
    };
    const updatedUserAuditDetails = utils.updateAuditDetailsFailIfNotExists(dbDetailsItem.details.auditDetails, primaryUser);
    const dbDetailItem: DbItemUser = {
      PK: dbDetailsItem.PK,
      E_GSI_PK: dbDetailsItem.E_GSI_PK,
      details: {
        ...dbDetailsItem.details,
        auditDetails: updatedUserAuditDetails,
        phash
      }
    };
    transactionWriter.putItems(dbDetailItem as unknown as JSONObject, _userTableName);
  }
  //////////  get token records, if found any notify user, because only 1 browser session can be active
  const getTokenCmd: GetCommandInput = {
    TableName: _userTableName,
    Key: { PK: getTokenTablePk(dbDetailsItem.details) }
  };
  const tokenItem = await dbutil.getItem(getTokenCmd, logger, dbutil.CacheAction.NOT_FROM_CACHE);

  if (tokenItem?.Item && req.forceLogin !== true) {
    // found active session
    const dbToken = tokenItem.Item as DbItemToken;
    const notifyResult = {
      existingActiveSession: {
        address: [dbToken.details.activeAddress.city, dbToken.details.activeAddress.state, dbToken.details.activeAddress.country].join(", "),
        platform: dbToken.details.platform,
        browser: dbToken.details.browser,
        browserVersion: dbToken.details.browserVersion,
        deviceMode: dbToken.details.deviceType
      }
    };
    return {
      statusCode: HTTP_STATUS_CODE.CONFLICT,
      body: notifyResult
    };
  }

  const accessTokenObj = await getSignedToken(AuthRole.PRIMARY);
  const dbTokenItem: DbItemToken = {
    PK: getTokenTablePk(dbDetailsItem.details),
    E_GSI_PK: getTokenGsiPk(accessTokenObj.getTokenPayload()),
    ExpiresAt: accessTokenObj.getExpiresAt().toSeconds(),
    details: {
      userId: dbDetailsItem.details.id,
      sessionId: accessTokenObj.getSessionId(),
      userRole: accessTokenObj.getUserRole(),
      platform: getPlatForm(event),
      browser: getBrowser(event),
      userAgent: getUserAgent(event),
      browserVersion: getBrowserVersion(event),
      deviceType: getDeviceType(event),
      activeAddress: {
        city: getCity(event),
        state: getState(event),
        country: getCountryCode(event)
      },
      initializedAt: accessTokenObj.initializedAt,
      tokenExpiresAt: accessTokenObj.getExpiresAt().toMillis()
    }
  };

  transactionWriter.putItems(dbTokenItem as unknown as JSONObject, _userTableName);

  await transactionWriter.executeTransaction();
  // const updateResult = await dbutil.putItem(putcmdInput, logger);
  logger.info("updateResult", "accessTokenObj", accessTokenObj);

  return {
    headers: {
      Authorization: `Bearer ${accessTokenObj.token}`
    },
    body: {
      expiresIn: accessTokenObj.expiresIn(),
      expiryTime: accessTokenObj.getExpiresAt().toMillis()
    }
  };
};
export const login = apiGatewayHandlerWrapper(loginHandler, RequestBodyContentType.JSON);

export const logout = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("logout", _logger);
  const authUser = getAuthorizeUser(event);
  logger.info("received request for userId", authUser.userId);
  const delCmdInput: DeleteCommandInput = {
    TableName: _userTableName,
    Key: { PK: getTokenTablePk(authUser) },
    ReturnValues: ReturnValue.NONE
  };
  const updateResult = await dbutil.deleteItem(delCmdInput, logger);
  logger.info("deleted token");
  return null;
});

const getValidatedRequestForLogin = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("validateRequest", loggerBase);
  type LoginRequestResource = ApiUserResource & { forceLogin: boolean };
  const req = utils.getJsonObj<LoginRequestResource>(event.body as string);
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
