import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { MissingError } from "../apigateway";
import { getLogger, LoggerBase } from "./logger";
import { caching } from "cache-manager";
import ms from "ms";
import { getJsonObj } from "./utils";

const _smClient = new SecretsManagerClient();
const _logger = getLogger("secret.utils", null, null, "DEBUG");

const secretMemoryCache = caching("memory", {
  max: 5,
  ttl: ms("5 min")
});

export const getSecret = async <T>(secretId: string, fromCache: boolean, loggerBase: LoggerBase) => {
  const logger = getLogger("getSecret", _logger, loggerBase);

  const cacheKey = secretId;

  const secretCache = await secretMemoryCache;
  if (!fromCache) {
    secretCache.del(cacheKey);
  }
  const secretString = secretCache.wrap(cacheKey, async () => {
    const cmd = new GetSecretValueCommand({
      SecretId: secretId
    });
    const res = await _smClient.send(cmd);
    logger.debug("command", cmd, "result: ", res);
    return res.SecretString as string;
  });

  if (!secretString) {
    throw new MissingError("secret not found");
  }
  const obj = getJsonObj<T>(await secretString);
  if (obj) {
    return obj;
  }
  return secretString as T;
};
