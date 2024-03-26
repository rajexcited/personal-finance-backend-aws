import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import * as bcrypt from "bcryptjs";
import { getLogger } from "../utils";

const _smClient = new SecretsManagerClient();
const _secretId = process.env.PSALT_SECRET_ID;
// todo change this to info after successful testing
const _logger = getLogger("pcrypt", undefined, "DEBUG");

const decode = (encoded: string) => {
  // const decoded = atob(encoded);
  const decoded = encoded;
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
  const salt = await getSecret();
  logger.debug("salt=", salt);
  const hash = bcrypt.hashSync(decoded, salt);
  logger.debug("hash=", hash);
  return hash.substring(salt.length);
};

export const verify = async (password: string, hash: string) => {
  const logger = getLogger("encrypt", _logger);
  const decoded = decode(password);
  logger.debug("decoded=", decoded, "hash", hash);
  const salt = await getSecret();
  logger.debug("salt=", salt);
  const isMatched = bcrypt.compareSync(decoded, salt + hash);
  logger.debug("isMatched?", isMatched);
  return isMatched;
};

const getSecret = async () => {
  const logger = getLogger("getSecret", _logger);
  const cmd = new GetSecretValueCommand({ SecretId: _secretId });
  logger.info("command", cmd);
  const res = await _smClient.send(cmd);
  logger.debug("result=", res);
  const secret = res.SecretString as string;

  return secret;
};
