import * as bcrypt from "bcryptjs";
import { getLogger, secretutil } from "../utils";
import { StopWatch } from "stopwatch-node";

const _secretId = process.env.AUTH_SECRET_ID as string;
const _logger = getLogger("pcrypt", null, null, "DEBUG");

interface AuthSaltSecret {
  saltCurrent: string;
  saltPrevious: string;
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
  const hash = bcrypt.hashSync(decoded, saltObj.saltCurrent);
  logger.debug("hash=", hash);
  return hash.substring(saltObj.saltCurrent.length);
};

export const verifyCurrPrev = async (password: string, hash: string) => {
  const stopwatch = new StopWatch("getItem");
  const logger = getLogger("encrypt", _logger);
  try {
    stopwatch.start();
    const decoded = decode(password);
    logger.debug("decoded=", decoded, "hash", hash);
    const saltObj = await getSecret();
    logger.debug("salt=", saltObj);
    const saltMatched = {
      current: false,
      previous: false
    };

    try {
      saltMatched.current = bcrypt.compareSync(decoded, saltObj.saltCurrent + hash);
    } catch (ignore) {
      logger.warn("error matching password with current salt", ignore);
    }
    try {
      if (!saltMatched.current) {
        saltMatched.previous = bcrypt.compareSync(decoded, saltObj.saltPrevious + hash);
      }
    } catch (ignore) {
      logger.warn("error matching password with previous salt", ignore);
    }
    logger.debug("salt isMatched?", saltMatched);
    return saltMatched;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

const getSecret = async () => {
  const logger = getLogger("getSecret", _logger);
  logger.info("getting auth secret value");

  const secretValue = await secretutil.getSecret<AuthSaltSecret>(_secretId, true, logger);

  return secretValue;
};

export const initiate = () => {
  // request secret as soon as file loaded to improve the performance
  getSecret();
};
