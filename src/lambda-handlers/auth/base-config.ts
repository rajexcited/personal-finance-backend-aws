import { getLogger } from "../utils";

export const _tokenSecretId = process.env.AUTH_SECRET_ID as string;

export const _userTableName = process.env.USER_TABLE_NAME as string;
export const _logger = getLogger("authen");

export const _rootPath = process.env.ROOT_PATH as string;
