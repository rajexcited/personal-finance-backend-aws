import { APIGatewayProxyEvent } from "aws-lambda";
import { getSignedToken } from "../auth";
import { apiGatewayHandlerWrapper } from "../apigateway";
import { getLogger, dbutil } from "../utils";
import { _logger, _userTableName, getValidatedUserId, getTokenTablePk } from "./base-config";
import { DbItemToken } from "./resource-type";

export const renewToken = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("renewToken", _logger);
  const userId = getValidatedUserId(event);
  const role = event.requestContext.authorizer?.role;

  const accessTokenObj = await getSignedToken(userId, role);
  const dbTokenItem: DbItemToken = {
    PK: getTokenTablePk(userId),
    ExpiresAt: accessTokenObj.getExpiresAt().toSeconds(),
    details: {
      iat: accessTokenObj.iat,
      tokenExpiresAt: accessTokenObj.getExpiresAt().toMillis(),
    },
  };
  const cmdInput = {
    TableName: _userTableName,
    Item: dbTokenItem,
  };
  const updateResult = await dbutil.putItem(cmdInput, logger);
  logger.info("updated Result", "accessTokenObj", accessTokenObj);

  return {
    accessToken: accessTokenObj.token,
    expiresIn: accessTokenObj.expiresIn(),
    expiryTime: accessTokenObj.getExpiresAt().toMillis(),
  };
});
