import { InvalidError, NotFoundError } from "../../apigateway";
import { ExpenseBelongsTo } from "../base-config";
import { convertReceiptDbToApiResource } from "../../receipts/api-resource";
import { AuthorizeUser } from "../../user";
import { getLogger, LoggerBase, utils } from "../../utils";
import { DbDetailsRefund } from "./db-config";
import { ApiResourceRefundDetails } from "./api-resource";

export const convertRefundDbToApiResource = async (dbDetails: DbDetailsRefund | undefined | null, authUser: AuthorizeUser, _logger: LoggerBase) => {
  const logger = getLogger("convertRefundDbToApiResource", _logger);
  if (!dbDetails) {
    logger.info("db details undefined");
    throw new NotFoundError("refund details record not found");
  }
  const auditDetails = await utils.parseAuditDetails(dbDetails.auditDetails, authUser.userId, authUser);

  logger.debug("auditDetails", auditDetails);
  if (dbDetails.belongsTo !== ExpenseBelongsTo.Refund) {
    throw new InvalidError("db details doesnot belongs to Refund");
  }
  const apiReceipts = dbDetails.receipts.map((dbRct) => convertReceiptDbToApiResource(dbRct, dbDetails.id, logger));

  const apiResource: ApiResourceRefundDetails = {
    id: dbDetails.id,
    billName: dbDetails.billName,
    amount: dbDetails.amount,
    belongsTo: dbDetails.belongsTo,
    description: dbDetails.description,
    refundDate: dbDetails.refundDate,
    reasonId: dbDetails.reasonId,
    status: dbDetails.status,
    tags: dbDetails.tags,
    paymentAccountId: dbDetails.paymentAccountId,
    verifiedTimestamp: dbDetails.verifiedTimestamp,
    purchaseId: dbDetails.purchaseId,
    receipts: apiReceipts,
    auditDetails: auditDetails,
  };

  return apiResource;
};
