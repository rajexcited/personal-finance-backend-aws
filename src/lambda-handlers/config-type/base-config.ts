import { getLogger } from "../utils";
import { Status } from "./resource-type";

export const _configTypeTableName = process.env.CONFIG_TYPE_TABLE_NAME as string;
export const _belongsToGsiName = process.env.CONFIG_TYPE_BELONGS_TO_GSI_NAME as string;
export const _logger = getLogger("config-type");

export enum ErrorMessage {
  INCORRECT_VALUE = "incorrect value",
  INCORRECT_FORMAT = "incorrect format",
  MISSING_VALUE = "missing value",
}

export enum ResourcePath {
  REQUEST = "request",
  BELONGS_TO = "belongsTo",
  STATUS = "status",
}

export interface StatusQueryParam {
  [key: string]: Status;
}
