import { LoggerBase, dbutil, getLogger, validations } from "../utils";
import {
  BelongsTo,
  CONFIG_NAME_VALUE_MAX_LENGTH,
  CONFIG_NAME_VALUE_MIN_LENGTH,
  _configTypeTableName,
  getBelongsToGsiPk,
  getDetailsTablePk,
} from "./base-config";
import { DbItemConfigType } from "./resource-type";

export const isConfigIdExists = async (cfgId: string | null | undefined, belongsTo: BelongsTo, userId: string, _logger: LoggerBase) => {
  const confingItem = await getConfigItem(cfgId, _logger);
  if (!confingItem) {
    return false;
  }
  const gsiPk = getBelongsToGsiPk(null, _logger, userId, belongsTo);
  return confingItem?.details.id === cfgId && confingItem?.details.belongsTo === belongsTo && gsiPk === confingItem.UB_GSI_PK;
};

const getConfigItem = async (cfgId: string | null | undefined, _logger: LoggerBase) => {
  if (!validations.isValidUuid(cfgId)) {
    return null;
  }
  const logger = getLogger("getConfigDetails", _logger);
  const cmdInput = {
    TableName: _configTypeTableName,
    Key: { PK: getDetailsTablePk(cfgId as string) },
  };
  const getOutput = await dbutil.getItem(cmdInput, logger);
  logger.info("retrieved get Output");
  const item = getOutput.Item as DbItemConfigType | null;
  return item;
};

export const isValidConfigName = (cfgName: string, belongsTo: BelongsTo) => {
  if (belongsTo === BelongsTo.SharePerson) {
    return validations.isValidEmail(cfgName);
  }
  return validations.isValidName(cfgName, CONFIG_NAME_VALUE_MAX_LENGTH, CONFIG_NAME_VALUE_MIN_LENGTH);
};

export const isValidConfigValue = (cfgVal: string, belongsTo: BelongsTo) => {
  if (belongsTo === BelongsTo.SharePerson) {
    try {
      return Array.isArray(JSON.parse(cfgVal));
    } catch (ignore) {}
    return false;
  }
  return validations.isValidName(cfgVal, CONFIG_NAME_VALUE_MAX_LENGTH, CONFIG_NAME_VALUE_MIN_LENGTH);
};
