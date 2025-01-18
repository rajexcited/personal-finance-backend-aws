import { APIGatewayProxyEvent } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { getSignedToken } from "../auth";
import { apiGatewayHandlerWrapper } from "../apigateway";
import { getLogger, dbutil } from "../utils";
import {
  _logger,
  _userTableName,
  getValidatedUserId,
  getTokenTablePk,
  getBrowser,
  getBrowserVersion,
  getCity,
  getCountryCode,
  getDeviceType,
  getPlatForm,
  getState,
  getUserAgent,
  getAuthorizeUser,
  getTokenGsiPk
} from "./base-config";
import { DbItemToken } from "./resource-type";

export const renewToken = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("renewToken", _logger);
  const authUser = getAuthorizeUser(event);
  const role = event.requestContext.authorizer?.role;

  const accessTokenObj = await getSignedToken(role);
  const dbTokenItem: DbItemToken = {
    PK: getTokenTablePk(authUser),
    E_GSI_PK: getTokenGsiPk(accessTokenObj.getTokenPayload()),
    ExpiresAt: accessTokenObj.getExpiresAt().toSeconds(),
    details: {
      userId: authUser.userId,
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
  const cmdInput = {
    TableName: _userTableName,
    Item: dbTokenItem
  };
  const updateResult = await dbutil.putItem(cmdInput, logger);
  logger.info("updated Result", updateResult, "accessTokenObj", accessTokenObj);

  return {
    headers: {
      Authorization: `Bearer ${accessTokenObj.token}`
    },
    body: {
      expiresIn: accessTokenObj.expiresIn(),
      expiryTime: accessTokenObj.getExpiresAt().toMillis()
    }
  };
});
