import { dbutil, getLogger, utils } from "../utils";
import { _logger, _pymtAccTableName, getDetailsTablePk, getUserIdGsiPk } from "./base-config";
import { DbPaymentAccountDetails, DbPymtAccItem, DefaultPaymentAccounts } from "./resource-type";
import { v4 as uuidv4 } from "uuid";

export const createDetails = async (details: DefaultPaymentAccounts[], userId: string) => {
  const logger = getLogger("createDetails", _logger);
  logger.info("details", details);
  const auditDetails = utils.updateAuditDetails(null, userId);
  if (!auditDetails) {
    throw new Error("invalid auditDetails");
  }
  const items = details.map((detail) => {
    const itemDetail: DbPaymentAccountDetails = {
      id: uuidv4(),
      shortName: detail.shortName,
      accountName: detail.accountName,
      description: detail.description,
      tags: detail.tags,
      paymentAccountType: detail.paymentAccountType,
      institutionName: detail.institutionName,
      auditDetails: { ...auditDetails },
    };
    const item: DbPymtAccItem = {
      PK: getDetailsTablePk(itemDetail.id),
      UP_GSI_PK: getUserIdGsiPk(userId),
      details: itemDetail,
    };
    return item;
  });

  await dbutil.batchAddUpdate(items, _pymtAccTableName, logger);
  return items.map((item) => item.details);
};
