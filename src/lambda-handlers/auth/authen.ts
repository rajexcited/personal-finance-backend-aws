import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerHandler, PolicyDocument } from "aws-lambda";
import * as jwt from "jsonwebtoken";
import { TokenHeader, TokenPayload, TokenSecret } from "./auth-type";
import { RoleAuthConfigList } from "./role-config";
import { utils, getLogger, validations, dbutil, LoggerBase, secretutil } from "../utils";
import { DbItemToken } from "../user";
import { AuthRole } from "../common";
import { UnAuthenticatedError, ValidationError } from "../apigateway";
import { _logger, _userTableName, _rootPath, _tokenSecretId } from "./base-config";
import { GetCommandInput, QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { _userEmailGsiName, getTokenGsiPk } from "../user/base-config";

export const authorizer: APIGatewayTokenAuthorizerHandler = async (event, context) => {
  const logger = getLogger("authorizer", _logger);
  // calling early to cache to reduce secret api time delay
  getSecret(logger);
  logger.debug("event", event);
  logger.debug("context", context);

  var token = event.authorizationToken.replace("Bearer ", "");
  logger.info("received token", token);
  const payload = getTokenPayload(token);

  let iamPolicyDocument = denyPolicy(event.methodArn);
  const authenticatedResponse = await authenticate(token);
  logger.info("authenticate response", authenticatedResponse);
  let authorizeResponse: AuthorizeResponse = { isAuthorized: false, clearCacheAfter: false };
  if (authenticatedResponse.isAuthenticated && authenticatedResponse.decoded) {
    authorizeResponse = await authorize(payload, event.methodArn, authenticatedResponse.decoded as jwt.JwtPayload);
    logger.info("isAuthorized response=", authorizeResponse);
    if (authorizeResponse.isAuthorized) {
      iamPolicyDocument = allowPolicy(event.methodArn, payload.role as AuthRole, logger);
    }
  }
  const dbTokenDetails = await queryDbToken(payload, logger, authorizeResponse.clearCacheAfter);
  const resp: APIGatewayAuthorizerResult = {
    policyDocument: iamPolicyDocument,
    principalId: dbTokenDetails?.userId || "unknown",
    context: {
      role: payload.role
    }
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
    const secret = await getSecret(logger);
    const decoded = jwt.verify(token, secret.tokenSecret) as jwt.JwtPayload;
    logger.info("decoded result", decoded);

    const expiringTime = decoded.exp as number;
    logger.info("expiringTime =", expiringTime, " / ", new Date(expiringTime));
    logger.info("iat =", decoded.iat, " / ", new Date(decoded.iat as number));
    const nowInMillis = Date.now();
    logger.info(
      "Date.now =",
      nowInMillis,
      ", new Date() =",
      new Date(nowInMillis),
      "; expiringTime-iat =",
      expiringTime - (decoded.iat as number),
      ", now-expiringTime =",
      expiringTime - nowInMillis
    );
    if (expiringTime < nowInMillis) {
      throw new UnAuthenticatedError("It is expired. expiringTime [" + expiringTime + "(" + new Date(expiringTime) + ")]");
    }
    if (tokenHeaders.alg !== secret.algorithm) {
      throw new UnAuthenticatedError("algorithm used in token is not supported. actual [" + tokenHeaders.alg + "], but expected [" + secret.algorithm + "]");
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

type AuthorizeResponse = Record<"isAuthorized" | "clearCacheAfter", boolean>;
const authorize = async (payload: TokenPayload, resourceArn: string, jwtPayload: jwt.JwtPayload): Promise<AuthorizeResponse> => {
  const logger = getLogger("authorize", _logger);

  // verify if role is allowed for rest
  const roles = Object.values(AuthRole) as string[];
  if (!roles.includes(payload.role)) {
    logger.info("given role [" + payload.role + "] in token is not supported");
    return { isAuthorized: false, clearCacheAfter: false };
  }

  const { methodUri, httpMethod } = getResourceParts(resourceArn, logger);

  const filteredCfg = RoleAuthConfigList.filter((cfg) => {
    const includesStar = cfg.apiPath.includes("/*");
    const fullApiPath = _rootPath + cfg.apiPath;
    if (includesStar) {
      const regex = new RegExp("^" + fullApiPath.split("*").join("[^/]+") + "$");
      if (!regex.test(methodUri)) {
        return false;
      }
    } else if (fullApiPath !== methodUri) {
      return false;
    }
    return cfg.method.toString() === httpMethod;
  });
  logger.info("filteredCfg", filteredCfg);

  if (filteredCfg.length !== 1) {
    logger.info("length of filteredCfg array is not equal to 1");
    return { isAuthorized: false, clearCacheAfter: false };
  }

  if (filteredCfg[0].role.length) {
    const rolesAllowed = filteredCfg[0].role.filter((r) => payload.role === r);
    logger.info("rolesAllowed", rolesAllowed);
    if (!rolesAllowed.length) {
      logger.info("role is not allowed");
      return { isAuthorized: false, clearCacheAfter: false };
    }
  }

  const dbTokenDetails = await queryDbToken(payload, logger, false);
  if (!dbTokenDetails) {
    return { isAuthorized: false, clearCacheAfter: !!filteredCfg[0].clearCache };
  }
  if (Date.now() > dbTokenDetails.tokenExpiresAt) {
    logger.info("token is expired. expiredAt [" + dbTokenDetails.tokenExpiresAt + "( " + new Date(dbTokenDetails.tokenExpiresAt) + " )]");
    return { isAuthorized: false, clearCacheAfter: !!filteredCfg[0].clearCache };
  }

  // making sure that old token is not used to authorize
  if (dbTokenDetails.initializedAt !== jwtPayload.iat) {
    logger.info("iat is not same. actual in token [" + jwtPayload.iat + "], but expected in db [" + dbTokenDetails.initializedAt + "]");
    return { isAuthorized: false, clearCacheAfter: !!filteredCfg[0].clearCache };
  }

  return { isAuthorized: true, clearCacheAfter: !!filteredCfg[0].clearCache };
};

const getTokenHeader = (token: string) => {
  const headerPart = token.split(".", 1)[0];
  const decodedHeader = atob(headerPart);
  const obj = utils.getJsonObj<TokenHeader>(decodedHeader);
  if (!obj || !obj.typ || !obj.alg) {
    throw new ValidationError([{ path: "header", message: "invalid json" }]);
  }
  return obj;
};

const getTokenPayload = (token: string) => {
  const payloadPart = token.split(".", 2)[1];
  const decodedPayload = atob(payloadPart);
  const obj = utils.getJsonObj<TokenPayload>(decodedPayload);
  if (!obj || !obj.iat || !obj.id || !obj.role) {
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

const allowPolicy = (resourceArn: string, role: AuthRole, baseLogger: LoggerBase) => {
  const logger = getLogger("allowPolicy", baseLogger);
  const methodWithUris = RoleAuthConfigList.filter((cfg) => cfg.role.includes(role)).map((cfg) => cfg.method + _rootPath + cfg.apiPath);
  const { resourceArnWithoutMethodAndUri } = getResourceParts(resourceArn, logger);
  const resources = methodWithUris.map((mu) => resourceArnWithoutMethodAndUri + mu);
  // logger.debug("allowed resources", resources);
  return generatePolicy("Allow", resources);
};

const generatePolicy = function (effect: "Allow" | "Deny", resourceArn: string | string[]) {
  const policyDocument: PolicyDocument = {
    Version: "2012-10-17",
    Statement: [
      {
        Action: "execute-api:Invoke",
        Effect: effect,
        Resource: resourceArn
      }
    ]
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
    resourceArnPrefix: resourceParts.slice(0, -1).join(":")
  };
};

const getSecret = async (loggerBase?: LoggerBase) => {
  const logger = getLogger("getSecret", loggerBase);
  return await secretutil.getSecret<TokenSecret>(_tokenSecretId, true, logger);
};

const queryDbToken = async (tokenPayload: TokenPayload, loggerBase: LoggerBase, clearCacheAfter: boolean) => {
  const logger = getLogger("queryDbToken", loggerBase);
  const cmdInput: QueryCommandInput = {
    TableName: _userTableName,
    IndexName: _userEmailGsiName,
    KeyConditionExpression: "E_GSI_PK = :pk",
    ExpressionAttributeValues: {
      ":pk": getTokenGsiPk(tokenPayload)
    }
  };

  const result = await dbutil.queryOnce(cmdInput, logger, dbutil.CacheAction.FROM_CACHE);
  if (clearCacheAfter) {
    dbutil.queryOnce(cmdInput, logger, dbutil.CacheAction.CLEAR_CACHE_NO_CALL);
  }
  if (!result?.Items || result.Items.length === 0) {
    logger.info("there isn't any token details found in db");
    return null;
  }
  const tokenItem = result.Items[0] as Pick<DbItemToken, "PK" | "E_GSI_PK">;
  const getItemCmdInput: GetCommandInput = {
    TableName: _userTableName,
    Key: { PK: tokenItem.PK }
  };
  let response = await dbutil.getItem(getItemCmdInput, logger, dbutil.CacheAction.FROM_CACHE);
  logger.debug("retrieved db token details from cache");
  let item = response?.Item as DbItemToken;

  if (tokenPayload.id !== item.details.sessionId) {
    logger.debug("found removed session in cache.");
    const cachedCmdInput: QueryCommandInput = {
      TableName: _userTableName,
      IndexName: _userEmailGsiName,
      KeyConditionExpression: "E_GSI_PK = :pk",
      ExpressionAttributeValues: {
        ":pk": getTokenGsiPk(item.details)
      }
    };
    dbutil.queryOnce(cachedCmdInput, logger, dbutil.CacheAction.CLEAR_CACHE_NO_CALL);
    response = await dbutil.getItem(getItemCmdInput, logger, dbutil.CacheAction.NOT_FROM_CACHE);
    logger.debug("retrieved db token details throug dynamodb api call. clearing queryOnce cache as well.");
    item = response?.Item as DbItemToken;
  }

  return item.details;
};
