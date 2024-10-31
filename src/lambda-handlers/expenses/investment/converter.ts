import { InvalidError } from "../../apigateway";
import { ExpenseBelongsTo } from "../base-config";
import { convertReceiptDbToApiResource } from "../../receipts/api-resource";
import { AuthorizeUser } from "../../user";
import { getLogger, LoggerBase, utils } from "../../utils";
import { DbDetailsInvestment } from "./db-config";
import { ApiResourceInvestmentDetails } from "./resource-type";

export const convertInvestmentDbToApiResource = async (dbDetails: DbDetailsInvestment, authUser: AuthorizeUser, _logger: LoggerBase) => {
  const logger = getLogger("convertInvestmentDbToApiResource", _logger);
  const auditDetails = await utils.parseAuditDetails(dbDetails.auditDetails, authUser.userId, authUser);

  logger.debug("auditDetails", auditDetails);
  if (dbDetails.belongsTo !== ExpenseBelongsTo.Investment) {
    throw new InvalidError("db details doesnot belongs to Investment");
  }
  const apiReceipts = dbDetails.receipts.map((dbRct) => convertReceiptDbToApiResource(dbRct, dbDetails.id, ExpenseBelongsTo.Investment, logger));

  const apiResource: ApiResourceInvestmentDetails = {
    id: dbDetails.id,
    billName: dbDetails.billName,
    portfolioName: dbDetails.portfolioName,
    amount: dbDetails.amount,
    belongsTo: dbDetails.belongsTo,
    description: dbDetails.description,
    investmentDate: dbDetails.investmentDate,
    maturityDate: dbDetails.maturityDate,
    status: dbDetails.status,
    tags: dbDetails.tags,
    paymentAccountId: dbDetails.paymentAccountId,
    fundingAccountId: dbDetails.fundingAccountId,
    goals: dbDetails.goals,
    interestRate: dbDetails.interestRate,
    investmentTypeId: dbDetails.investmentTypeId,
    targetYear: dbDetails.targetYear,
    verifiedTimestamp: dbDetails.verifiedTimestamp,
    receipts: apiReceipts,
    auditDetails: auditDetails,
  };

  return apiResource;
};
