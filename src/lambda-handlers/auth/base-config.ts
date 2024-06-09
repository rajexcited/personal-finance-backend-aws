import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { getLogger } from "../utils";
import { TokenHeader } from "./auth-type";

export const _smClient = new SecretsManagerClient();
export const _tokenSecretId = process.env.TOKEN_SECRET_ID;

export const _userTableName = process.env.USER_TABLE_NAME as string;
export const _logger = getLogger("authen");

export const _rootPath = process.env.ROOT_PATH as string;
