import { InvalidError } from "../../apigateway";
import { ExpenseBelongsTo } from "../base-config";
import { convertReceiptDbToApiResource } from "../../receipts/api-resource";
import { AuthorizeUser } from "../../user";
import { getLogger, LoggerBase, utils } from "../../utils";
import { DbDetailsIncome } from "./db-config";
import { ApiResourceIncomeDetails } from "./api-resource";

export const convertIncomeDbToApiResource = async (dbDetails: DbDetailsIncome, authUser: AuthorizeUser, _logger: LoggerBase) => {
  const logger = getLogger("convertIncomeDbToApiResource", _logger);
  const auditDetails = await utils.parseAuditDetails(dbDetails.auditDetails, authUser.userId, authUser);

  logger.debug("auditDetails", auditDetails);
  if (dbDetails.belongsTo !== ExpenseBelongsTo.Income) {
    throw new InvalidError("db details doesnot belongs to Income");
  }
  const apiReceipts = dbDetails.receipts.map((dbRct) => convertReceiptDbToApiResource(dbRct, dbDetails.id, ExpenseBelongsTo.Income, logger));

  const apiResource: ApiResourceIncomeDetails = {
    id: dbDetails.id,
    billName: dbDetails.billName,
    amount: dbDetails.amount,
    belongsTo: dbDetails.belongsTo,
    description: dbDetails.description,
    incomeDate: dbDetails.incomeDate,
    incomeTypeId: dbDetails.incomeTypeId,
    status: dbDetails.status,
    tags: dbDetails.tags,
    paymentAccountId: dbDetails.paymentAccountId,
    verifiedTimestamp: dbDetails.verifiedTimestamp,
    receipts: apiReceipts,
    auditDetails: auditDetails,
    personIds: dbDetails.personIds,
    profileId: dbDetails.profileId,
  };

  return apiResource;
};
