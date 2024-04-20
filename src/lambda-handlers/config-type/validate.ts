import { LoggerBase, dbutil, getLogger, validations } from "../utils";
import { BelongsTo, _configTypeTableName, getDetailsTablePk } from "./base-config";
import { DbConfigTypeItem } from "./resource-type";

export const isValidPaymentAccountId = async (pymtAccId: string, _logger: LoggerBase) => {
  const confDetail = await getConfigDetails(pymtAccId, _logger);
  return confDetail?.id === pymtAccId && confDetail.belongsTo === BelongsTo.PaymentAccountType;
};

export const isValidExpenseCategoryId = async (xpnsCtgryId: string, _logger: LoggerBase) => {
  const confDetail = await getConfigDetails(xpnsCtgryId, _logger);
  return confDetail?.id === xpnsCtgryId && confDetail.belongsTo === BelongsTo.ExpenseCategory;
};

export const getConfigDetails = async (cfgId: string, _logger: LoggerBase) => {
  if (!validations.isValidUuid(cfgId)) {
    return null;
  }
  const logger = getLogger("getConfigDetails", _logger);
  const getOutput = await dbutil.ddbClient.get({
    TableName: _configTypeTableName,
    Key: { PK: getDetailsTablePk(cfgId) },
  });
  logger.info("getOutput", getOutput);
  const item = getOutput.Item as DbConfigTypeItem | null;
  return item?.details;
};
