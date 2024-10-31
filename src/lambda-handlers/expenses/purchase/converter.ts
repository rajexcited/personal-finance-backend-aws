import { InvalidError, NotFoundError } from "../../apigateway";
import { DbDetailsPurchase, DbDetailsPurchaseItem } from "./db-config";
import { convertReceiptDbToApiResource } from "../../receipts/api-resource";
import { AuthorizeUser } from "../../user";
import { getLogger, LoggerBase, utils } from "../../utils";
import { ExpenseBelongsTo } from "../base-config";
import { ApiResourcePurchaseDetails } from "./api-resource";

export const convertPurchaseDbToApiResource = async (
  dbDetails: DbDetailsPurchase | null | undefined,
  dbPurchaseItem: DbDetailsPurchaseItem | null | undefined,
  authUser: AuthorizeUser,
  _logger: LoggerBase
) => {
  const logger = getLogger("convertToPurchaseApiResource", _logger);
  if (!dbDetails) {
    logger.info("db details undefined");
    throw new NotFoundError("purchase details record not found");
  }
  const auditDetails = await utils.parseAuditDetails(dbDetails.auditDetails, authUser.userId, authUser);

  logger.debug("auditDetails", auditDetails);
  if (dbDetails.belongsTo !== ExpenseBelongsTo.Purchase) {
    throw new InvalidError("db details doesnot belongs to Purchase");
  }
  const apiReceipts = dbDetails.receipts.map((dbRct) => convertReceiptDbToApiResource(dbRct, dbDetails.id, ExpenseBelongsTo.Purchase, logger));

  const apiResource: ApiResourcePurchaseDetails = {
    id: dbDetails.id,
    billName: dbDetails.billName,
    amount: dbDetails.amount,
    belongsTo: dbDetails.belongsTo,
    description: dbDetails.description,
    purchaseDate: dbDetails.purchaseDate,
    purchaseTypeId: dbDetails.purchaseTypeId,
    status: dbDetails.status,
    tags: dbDetails.tags,
    paymentAccountId: dbDetails.paymentAccountId,
    verifiedTimestamp: dbDetails.verifiedTimestamp,
    receipts: apiReceipts,
    items: dbPurchaseItem?.items || [],
    auditDetails: auditDetails,
    personIds: dbDetails.personIds,
    profileId: dbDetails.profileId,
  };

  return apiResource;
};
