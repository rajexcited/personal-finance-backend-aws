import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerHandler, PolicyDocument } from "aws-lambda";
import * as jwt from "jsonwebtoken";
import { Role, TokenHeader, TokenPayload } from "./auth-type";
import { RoleAuthConfigList } from "./role-config";
import { utils, getLogger, validations, dbutil, LoggerBase } from "../utils";
import { DbUserTokenItem, getTokenTablePk } from "../user";
import { ValidationError } from "../apigateway";
import { _logger, _smClient, _tokenSecretId, _userTableName } from "./base-config";
import { getSecret } from "./token-secret";

export const authorizer: APIGatewayTokenAuthorizerHandler = async (event, context) => {
  const logger = getLogger("authorizer", _logger);
  logger.debug("event", event);
  logger.debug("context", context);

  var token = event.authorizationToken.replace("Bearer ", "");
  logger.info("received token", token);
  const payload = getTokenPayload(token);

  let iamPolicyDocument = denyPolicy(event.methodArn);
  const authenticatedResponse = await authenticate(token);
  logger.info("authenticate response", authenticatedResponse);
  if (authenticatedResponse.isAuthenticated && authenticatedResponse.decoded) {
    const isAuthorized = await authorize(payload, event.methodArn, authenticatedResponse.decoded as jwt.JwtPayload);
    logger.info("isAuthorized", isAuthorized);
    if (isAuthorized) {
      iamPolicyDocument = allowPolicy(event.methodArn, payload.role as Role, logger);
    }
  }
  const resp: APIGatewayAuthorizerResult = {
    policyDocument: iamPolicyDocument,
    principalId: payload.id,
    context: {
      role: payload.role,
    },
  };
  logger.info("authorizer response", resp);
  return resp;
};

const authenticate = async (token: string) => {
  const logger = getLogger("authenticate", _logger);
  try {
    const tokenHeaders = getTokenHeader(token);
    const tokenPayload = getTokenPayload(token);

    logger.info("token headers", tokenHeaders, "token payload", tokenPayload);
    const secret = await getSecret();
    const decoded = jwt.verify(token, secret.tokenSecret) as jwt.JwtPayload;
    logger.info("decoded result", decoded);

    const expiringTime = decoded.exp as number;
    if (expiringTime > Date.now()) {
      throw new UnAuthenticatedError("It is expired. expiringTime [" + expiringTime + "(" + new Date(expiringTime) + ")]");
    }
    if (tokenHeaders.alg !== secret.algorithm) {
      throw new UnAuthenticatedError(
        "algorithm used in token is not supported. actual [" + tokenHeaders.alg + "], but expected [" + secret.algorithm + "]"
      );
    }
    if (tokenHeaders.typ !== secret.type) {
      throw new UnAuthenticatedError("incorrect type in tokenHeader. actual [" + tokenHeaders.typ + "], but expected [" + secret.type + "]");
    }
    if (!validations.isValidUuid(tokenPayload.id)) {
      throw new UnAuthenticatedError("invalid user id format in token payload. actual [" + tokenPayload.id + "]");
    }
    if (!tokenPayload.role) {
      throw new UnAuthenticatedError("role is not found in token");
    }

    return { isAuthenticated: true, decoded: decoded };
  } catch (err) {
    logger.error("authentication failed", err);
    return { isAuthenticated: false };
  }
};

const authorize = async (payload: TokenPayload, resourceArn: string, jwtPayload: jwt.JwtPayload) => {
  const logger = getLogger("authorize", _logger);

  // verify if role is allowed for rest
  const roles = Object.values(Role) as string[];
  if (!roles.includes(payload.role)) {
    logger.info("given role [" + payload.role + "] in token is not supported");
    return false;
  }

  const { methodUri, httpMethod } = getResourceParts(resourceArn, logger);
  logger.debug("roleAuthConfigList", RoleAuthConfigList);
  const filteredCfg = RoleAuthConfigList.filter((cfg) => {
    const includesStar = cfg.apiPath.includes("/*");
    if (includesStar) {
      const regex = new RegExp("^" + cfg.apiPath.split("*").join("[^/]+") + "$");
      if (!regex.test(methodUri)) {
        return false;
      }
    } else if (cfg.apiPath !== methodUri) {
      return false;
    }
    return cfg.method.toString() === httpMethod;
  });
  logger.info("filteredCfg", filteredCfg);

  if (filteredCfg.length !== 1) {
    logger.info("length of filteredCfg array is not equal to 1");
    return false;
  }

  if (filteredCfg[0].role.length) {
    const rolesAllowed = filteredCfg[0].role.filter((r) => payload.role === r);
    logger.info("rolesAllowed", rolesAllowed);
    if (!rolesAllowed.length) {
      logger.info("role is not allowed");
      return false;
    }
  }

  // verify if user is valid
  const result = await dbutil.ddbClient.get({
    TableName: _userTableName,
    Key: { PK: getTokenTablePk(payload.id) },
  });

  logger.debug("getUser result", result);
  if (!result.Item) {
    logger.info("there isn't any token details found in db");
    return false;
  }

  const userItem = result.Item as DbUserTokenItem;
  if (Date.now() > userItem.details.tokenExpiresAt) {
    logger.info("token is expired. expiredAt [" + userItem.details.tokenExpiresAt + "( " + new Date(userItem.details.tokenExpiresAt) + " )]");
    return false;
  }

  // making sure that old token is not used to authorize
  if (userItem.details.iat !== jwtPayload.iat) {
    logger.info("iat is not same. actual in token [" + jwtPayload.iat + "], but expected in db [" + userItem.details.iat + "]");
    return false;
  }

  return true;
};

const getTokenHeader = (token: string) => {
  const headerPart = token.split(".", 1)[0];
  const decodedHeader = atob(headerPart);
  return utils.getJsonObj(decodedHeader) as TokenHeader;
};

const getTokenPayload = (token: string) => {
  const payloadPart = token.split(".", 2)[1];
  const decodedPayload = atob(payloadPart);
  const obj = utils.getJsonObj<TokenPayload>(decodedPayload);
  if (!obj) {
    throw new ValidationError([{ path: "payload", message: "invalid json" }]);
  }
  return obj;
};

// A simple token-based authorizer to authen token to allow or deny a request.
// If the token value is 'unauthorized' or an empty string,
// the authorizer function returns an HTTP 401 status code.

// Help function to generate an IAM policy
const denyPolicy = (resourceArn: string) => {
  return generatePolicy("Deny", resourceArn);
};

const allowPolicy = (resourceArn: string, role: Role, baseLogger: LoggerBase) => {
  const logger = getLogger("allowPolicy", baseLogger);
  const methodWithUris = RoleAuthConfigList.filter((cfg) => cfg.role.includes(role)).map((cfg) => cfg.method + cfg.apiPath);
  const { resourceArnWithoutMethodAndUri } = getResourceParts(resourceArn, logger);
  const resources = methodWithUris.map((mu) => resourceArnWithoutMethodAndUri + mu);
  logger.info("allowed resources", resources);
  return generatePolicy("Allow", resources);
};

const generatePolicy = function (effect: "Allow" | "Deny", resourceArn: string | string[]) {
  const policyDocument: PolicyDocument = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "execute-api:Invoke",
        Effect: effect,
        Resource: resourceArn,
      },
    ],
  };
  return policyDocument;
};

const getResourceParts = (resourceArn: string, baseLogger: LoggerBase) => {
  const logger = getLogger("getResourceParts", baseLogger);

  const resourceParts = resourceArn.split(":");
  const resourcePath = resourceParts.slice(-1)[0];
  const methodParts = resourcePath.split("/");
  const httpMethod = methodParts[2];
  const methodUri = methodParts.slice(2).join("/").replace(httpMethod, "");

  logger.info("from resourceArn", "httpMethod", httpMethod, "methodUri", methodUri);
  return {
    httpMethod,
    methodUri,
    resourceArn,
    resourceArnWithoutMethodAndUri: resourceArn.replace(httpMethod + methodUri, ""),
    apiNameWithStage: methodParts.slice(0, 2).join("/"),
    apiName: methodParts[0],
    stageName: methodParts[1],
    resourceArnPrefix: resourceParts.slice(0, -1).join(":"),
  };
};

export class UnAuthenticatedError extends Error {
  constructor(message?: string) {
    super(message);
  }
}
