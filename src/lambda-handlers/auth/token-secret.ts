import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { getLogger, utils } from "../utils";
import { _logger, _smClient, _tokenSecretId } from "./base-config";
import { TokenSecret } from "./auth-type";
import { ValidationError } from "../apigateway";

export const getSecret = async () => {
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
