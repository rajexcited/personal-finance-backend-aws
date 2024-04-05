import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { getLogger } from "../utils";

export const _smClient = new SecretsManagerClient();
export const _tokenSecretId = process.env.TOKEN_SECRET_ID;

export const _userTableName = process.env.USER_TABLE_NAME as string;
export const _logger = getLogger("authen");
