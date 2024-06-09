import { LoggerBase, dbutil, getLogger, validations } from "../utils";
import { BelongsTo, _configTypeTableName, getBelongsToGsiPk, getDetailsTablePk } from "./base-config";
import { DbItemConfigType } from "./resource-type";

export const isValidPaymentAccountTypeId = async (pymtAccId: string | null | undefined, userId: string, _logger: LoggerBase) => {
  if (!pymtAccId) {
    return false;
  }
  const confItem = await getConfigItem(pymtAccId, _logger);
  const gsiPk = getBelongsToGsiPk(null, _logger, userId, BelongsTo.PaymentAccountType);
  return confItem?.details.id === pymtAccId && confItem?.details.belongsTo === BelongsTo.PaymentAccountType && gsiPk === confItem.UB_GSI_PK;
};

export const isValidExpenseCategoryId = async (xpnsCtgryId: string | null | undefined, userId: string, _logger: LoggerBase) => {
  const confItem = await getConfigItem(xpnsCtgryId, _logger);
  const gsiPk = getBelongsToGsiPk(null, _logger, userId, BelongsTo.ExpenseCategory);
  return confItem?.details.id === xpnsCtgryId && confItem?.details.belongsTo === BelongsTo.ExpenseCategory && gsiPk === confItem.UB_GSI_PK;
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
