import { JSONObject, ValidationError } from "../apigateway";
import { dbutil, getLogger, utils, validations } from "../utils";
import {
  CONFIG_DESCRIPTION_MAX_LENGTH,
  ConfigResourcePath,
  ErrorMessage,
  MAX_ALLOWED_TAGS,
  _configTypeTableName,
  _logger,
  getBelongsToGsiPk,
  getBelongsToGsiSk,
  getDetailsTablePk,
  BelongsTo,
  ConfigStatus,
} from "./base-config";
import { DbConfigTypeDetails, DbConfigTypeItem } from "./resource-type";
import { v4 as uuidv4 } from "uuid";

export interface DefaultConfigData {
  name: string;
  value: string;
  tags: string[];
  description: string;
}

export const createDefaultDetails = async (
  details: DefaultConfigData[],
  belongsTo: BelongsTo,
  userId: string,
  transactionWriter: dbutil.TransactionWriter
) => {
  const logger = getLogger("createDefaultDetails", _logger);
  logger.info("details", details);

  const invalidConfData = details.filter((item) => {
    if (!validations.isValidName(item.name)) return true;
    if (!validations.isValidName(item.value)) return true;
    if (!validations.isValidDescription(item.description, CONFIG_DESCRIPTION_MAX_LENGTH)) return true;
    if (!validations.areTagsValid(item.tags, MAX_ALLOWED_TAGS)) return true;

    return false;
  });

  logger.info("invalidConfData.length =", invalidConfData.length);
  if (invalidConfData.length > 0) {
    logger.warn("invalidConfData =", invalidConfData);
    throw new ValidationError([{ path: ConfigResourcePath.REQUEST, message: ErrorMessage.INCORRECT_FORMAT }]);
  }

  const auditDetails = utils.updateAuditDetails(null, userId);
  if (!auditDetails) {
    throw new Error("invalid auditDetails");
  }
  const items = details.map((detail) => {
    const itemDetail: DbConfigTypeDetails = {
      id: uuidv4(),
      belongsTo: belongsTo,
      name: detail.name,
      value: detail.value,
      description: detail.description,
      tags: detail.tags,
      status: ConfigStatus.ENABLE,
      auditDetails: { ...auditDetails },
    };
    const item: DbConfigTypeItem = {
      details: itemDetail,
      PK: getDetailsTablePk(itemDetail.id),
      UB_GSI_PK: getBelongsToGsiPk(null, logger, userId, belongsTo),
      UB_GSI_SK: getBelongsToGsiSk(ConfigStatus.ENABLE),
    };
    return item;
  });

  transactionWriter.putItems(items as unknown as JSONObject[], _configTypeTableName, logger);
  //   await dbutil.batchAddUpdate(items, _configTypeTableName, logger);
  return items.map((item) => item.details);
};
