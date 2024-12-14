import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import * as bcrypt from "bcryptjs";
import { getLogger, utils } from "../utils";
import { caching } from "cache-manager";
import ms from "ms";

const _smClient = new SecretsManagerClient();
const _secretId = process.env.AUTH_SECRET_ID as string;
const _logger = getLogger("pcrypt", null, null, "INFO");

const secretMemoryCache = caching("memory", {
  max: 1,
  ttl: ms("5 min"),
});

interface SaltSecretValue {
  psalt: Record<"current" | "previous", string>;
}

export const decode = (encoded: string) => {
  const decoded = atob(encoded);
  // const decoded = encoded;
  return decoded.replace("$magic=", "").replace("$masked", "");
};

export const mask = (decoded: string) => {
  const logger = getLogger("mask", _logger);
  const masked = `$magic=${decoded}$masked`;
  const encoded = btoa(masked);
  logger.info("encoded", encoded);
  return encoded;
};

export const encrypt = async (password: string) => {
  const logger = getLogger("encrypt", _logger);
  const decoded = decode(password);
  logger.debug("decoded=", decoded);
  const saltObj = await getSecret();
  logger.debug("salt=", saltObj);
  const hash = bcrypt.hashSync(decoded, saltObj.psalt.current);
  logger.debug("hash=", hash);
  return hash.substring(saltObj.psalt.current.length);
};

export const verifyCurrPrev = async (password: string, hash: string) => {
  const logger = getLogger("encrypt", _logger);
  const decoded = decode(password);
  logger.debug("decoded=", decoded, "hash", hash);
  const saltObj = await getSecret();
  logger.debug("salt=", saltObj);
  const saltMatched = {
    current: false,
    previous: false,
  };

  try {
    saltMatched.current = bcrypt.compareSync(decoded, saltObj.psalt.current + hash);
  } catch (ignore) {}
  try {
    if (!saltMatched.current) {
      saltMatched.previous = bcrypt.compareSync(decoded, saltObj.psalt.previous + hash);
    }
  } catch (ignore) {}
  logger.debug("salt isMatched?", saltMatched);
  return saltMatched;
};

const getSecret = async () => {
  const logger = getLogger("getSecret", _logger);
  logger.info("getting secret value");
  const secretCache = await secretMemoryCache;
  const detailsPromise = secretCache.wrap(_secretId, async () => {
    const cmd = new GetSecretValueCommand({ SecretId: _secretId });
    logger.info("command", cmd);
    const res = await _smClient.send(cmd);
    logger.debug("result=", res);
    const objAsString = res.SecretString as string;
    const obj = utils.getJsonObj<SaltSecretValue>(objAsString);
    if (!obj) {
      throw new Error("salt secret obj not formatted correctly");
    }
    return obj;
  });

  return detailsPromise;
};
