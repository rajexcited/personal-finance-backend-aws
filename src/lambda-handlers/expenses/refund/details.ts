import { JSONObject } from "../../apigateway";
import { DbDetailsReceipt } from "../../receipts";
import { AuthorizeUser } from "../../user";
import { dbutil, getLogger, LoggerBase, utils } from "../../utils";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";
import { DbItemExpense, ExpenseRecordType, ExpenseTableName, getGsiPkDetails, getGsiSkDetailsExpenseDate } from "../db-config";
import { ApiResourceRefundDetails } from "./api-resource";
import { DbDetailsRefund, getGsiAttrDetailsRefundBelongsTo, getTablePkDetails } from "./db-config";
import { convertRefundDbToApiResource } from "./converter";
import { DbConfigTypeDetails } from "../../config-type";

export const addDbRefundTransactions = async (
  req: ApiResourceRefundDetails,
  dbItem: DbItemExpense<DbDetailsRefund> | null,
  dbReceipts: DbDetailsReceipt[],
  refundId: string,
  currencyProfile: DbConfigTypeDetails,
  authUser: AuthorizeUser,
  transactWriter: dbutil.TransactionWriter,
  logger: LoggerBase
) => {
  const dbRefundDetails = putDbRefund(req, dbItem, dbReceipts, refundId, currencyProfile, authUser, transactWriter, logger);

  const apiResource = await convertRefundDbToApiResource(dbRefundDetails.details, authUser, logger);

  return apiResource;
};

const putDbRefund = (
  req: ApiResourceRefundDetails,
  dbItem: DbItemExpense<DbDetailsRefund> | null,
  dbReceipts: DbDetailsReceipt[],
  refundId: string,
  currencyProfile: DbConfigTypeDetails,
  authUser: AuthorizeUser,
  transactWriter: dbutil.TransactionWriter,
  _logger: LoggerBase
) => {
  const logger = getLogger("putDbRefund", _logger);

  const auditDetails = utils.updateAuditDetailsFailIfNotExists(dbItem?.details.auditDetails, authUser);

  const apiToDbDetails: DbDetailsRefund = {
    id: refundId,
    billName: req.billName,
    refundDate: req.refundDate,
    verifiedTimestamp: req.verifiedTimestamp,
    status: ExpenseStatus.ENABLE,
    amount: req.amount,
    reasonId: req.reasonId,
    paymentAccountId: req.paymentAccountId,
    receipts: dbReceipts,
    description: req.description,
    tags: req.tags,
    auditDetails: auditDetails,
    belongsTo: ExpenseBelongsTo.Refund,
    recordType: ExpenseRecordType.Details,
    purchaseId: req.purchaseId,
    personIds: req.personIds,
    profileId: currencyProfile.id,
  };

  const dbItemRfd: DbItemExpense<DbDetailsRefund> = {
    PK: getTablePkDetails(refundId, logger),
    US_GSI_PK: getGsiPkDetails(authUser.userId, apiToDbDetails.status, currencyProfile, logger),
    US_GSI_SK: getGsiSkDetailsExpenseDate(apiToDbDetails.refundDate, logger),
    US_GSI_BELONGSTO: getGsiAttrDetailsRefundBelongsTo(logger),
    details: apiToDbDetails,
  };

  transactWriter.putItems(dbItemRfd as unknown as JSONObject, ExpenseTableName, logger);
  return dbItemRfd;
};

/**
 * Queries Database for refund details
 *
 * @param refundId
 * @param authUser
 * @param _logger
 * @returns
 */
export const retrieveDbRefundToApiResource = async (refundId: string, authUser: AuthorizeUser, _logger: LoggerBase) => {
  const logger = getLogger("retrieveDbRefund", _logger);

  const refundDetails = await retrieveDbRefundDetails(refundId, logger);

  const apiResource = await convertRefundDbToApiResource(refundDetails?.details, authUser, logger);
  return { apiResource, expenseDetails: refundDetails };
};

export const retrieveDbRefundDetails = async (refundId: string, logger: LoggerBase) => {
  const cmdInput = {
    TableName: ExpenseTableName,
    Key: { PK: getTablePkDetails(refundId, logger) },
  };
  const refundOutput = await dbutil.getItem(cmdInput, logger);
  if (refundOutput.Item) {
    logger.info("retrieved refund from DB not null");
    return refundOutput.Item as DbItemExpense<DbDetailsRefund>;
  }
  logger.info("retrieved refund from DB is null");

  return null;
};
