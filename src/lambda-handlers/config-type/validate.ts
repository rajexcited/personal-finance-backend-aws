import { LoggerBase, dbutil, getLogger, validations } from "../utils";
import { BelongsTo, _configTypeTableName, getBelongsToGsiPk, getDetailsTablePk } from "./base-config";
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
