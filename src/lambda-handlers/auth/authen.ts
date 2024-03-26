import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerHandler, PolicyDocument } from "aws-lambda";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import * as jwt from "jsonwebtoken";
import * as datetime from "date-and-time";
import { Role, TokenHeader, TokenPayload, TokenSecret } from "./auth-type";
import { roleAuthConfigList } from "./role-config";
import { utils, getLogger, validations } from "../utils";
import { DbUserTokenItem, getTokenTablePk } from "../user";
import { ValidationError } from "../handler-wrapper";

const _smClient = new SecretsManagerClient();
const _tokenSecretId = process.env.TOKEN_SECRET_ID;

const _ddbClient = DynamoDBDocument.from(new DynamoDBClient(), utils.DdbTranslateConfig);
const _userTableName = process.env.USER_TABLE_NAME as string;
const _maxExpiringSeconds = 60 * 60;
const _logger = getLogger("authen");

export const getSignedToken = async (userId: string, role?: Role) => {
  const logger = getLogger("getSignedToken", _logger);
  const iat = Date.now();

  const payload: TokenPayload = {
    role: role || Role.PRIMARY,
    id: userId,
    iat,
  };
  logger.info("token payload", payload);

  const secret = await getSecret();
  const options: jwt.SignOptions = {
    expiresIn: "1h",
    algorithm: secret.algorithm,
  };

  const token = jwt.sign(payload, secret.tokenSecret, options);
  logger.info("signed token", token);
  return {
    token,
    expiresIn: _maxExpiringSeconds,
    expiresAt: datetime.addSeconds(new Date(iat), _maxExpiringSeconds),
  };
};

export const authorizer: APIGatewayTokenAuthorizerHandler = async (event, context) => {
  const logger = getLogger("authorizer", _logger);
  logger.debug("event", event);
  logger.debug("context", context);

  var token = event.authorizationToken.replace("Bearer ", "");
  logger.info("received token", token);
  const payload = getTokenPayload(token);

  let iamPolicyDocument = denyPolicy(event.methodArn);
  const isAuthenticated = await authenticate(token);
  logger.info("isAuthenticated", isAuthenticated);
  if (isAuthenticated) {
    const isAuthorized = await authorize(payload, event.methodArn);
    logger.info("isAuthorized", isAuthorized);
    if (isAuthorized) {
      iamPolicyDocument = allowPolicy(event.methodArn);
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
      return false;
    }
    if (tokenHeaders.alg !== secret.algorithm) {
      return false;
    }
    if (tokenHeaders.typ !== secret.type) {
      return false;
    }
    if (!validations.isValidUuid(tokenPayload.id)) {
      return false;
    }
    if (!tokenPayload.role) {
      return false;
    }

    return true;
  } catch (err) {
    logger.error("authentication failed", err);
    return false;
  }
};

const authorize = async (payload: TokenPayload, resourceArn: string) => {
  const logger = getLogger("authorize", _logger);
  // verify if role is allowed for rest
  const roles = Object.values(Role) as string[];
  if (!roles.includes(payload.role)) {
    return false;
  }
  const resourceParts = resourceArn.split(":");
  const resourcePath = resourceParts.slice(-1)[0];
  const methodParts = resourcePath.split("/");
  const httpMethod = methodParts[2];
  const methodUri = methodParts.slice(2).join("/").replace(httpMethod, "");

  logger.info("from resourceArn", "httpMethod", httpMethod, "methodUri", methodUri);
  logger.debug("roleAuthConfigList", roleAuthConfigList);
  const filteredCfg = roleAuthConfigList.filter(
    (cfg) => cfg.apiPath === methodUri && cfg.method.toString() === httpMethod
  );
  logger.info("filteredCfg", filteredCfg);

  if (filteredCfg.length !== 1) {
    return false;
  }

  if (filteredCfg[0].role.length) {
    const rolesAllowed = filteredCfg[0].role.filter((r) => payload.role === r);
    logger.info("rolesAllowed", rolesAllowed);
    if (!rolesAllowed.length) {
      return false;
    }
  }

  // verify if user is valid
  const result = await _ddbClient.get({
    TableName: _userTableName,
    Key: { PK: getTokenTablePk(payload.id) },
  });
  logger.debug("getUser result", result);
  if (!result.Item) {
    return false;
  }

  const userItem = result.Item as DbUserTokenItem;
  if (Date.now() > userItem.tokenExpiresAt) {
    return false;
  }

  return true;
};

const getSecret = async () => {
  const logger = getLogger("getSecret", _logger);
  const cmd = new GetSecretValueCommand({
    SecretId: _tokenSecretId,
  });
  const res = await _smClient.send(cmd);
  //todo remove after testing
  logger.debug("command", cmd, "result: ", res);
  const secret = res.SecretString as string;
  const obj = utils.getJsonObj<TokenSecret>(secret);
  if (!obj) {
    throw new ValidationError([{ path: "secret", message: "invalid json" }]);
  }
  return obj;
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

const allowPolicy = (resourceArn: string) => {
  return generatePolicy("Allow", resourceArn);
};

var generatePolicy = function (effect: "Allow" | "Deny", resourceArn: string) {
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
