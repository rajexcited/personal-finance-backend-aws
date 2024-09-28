import { InvalidError, JSONObject } from "../../apigateway";
import { DbDetailsReceipt } from "../../receipts";
import { AuthorizeUser } from "../../user";
import { dbutil, getLogger, LoggerBase, utils } from "../../utils";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";
import { DbItemExpense, ExpenseRecordType, ExpenseTableName, getFormattedExpenseDate, getGsiPkDetails } from "../db-config";
import { ApiResourceIncomeDetails } from "./api-resource";
import { convertIncomeDbToApiResource } from "./converter";
import { DbDetailsIncome, getGsiAttrDetailsIncomeBelongsTo, getGsiSkIncomeDate, getTablePkDetails } from "./db-config";
import { v4 as uuidv4 } from "uuid";

export const addDbIncomeTransactions = async (
  req: ApiResourceIncomeDetails,
  dbItem: DbItemExpense<DbDetailsIncome> | null,
  dbReceipts: DbDetailsReceipt[],
  incomeId: string,
  authUser: AuthorizeUser,
  transactWriter: dbutil.TransactionWriter,
  logger: LoggerBase
) => {
  const dbIncomeDetails = putDbIncome(req, dbItem, dbReceipts, incomeId, authUser, transactWriter, logger);

  const apiResource = await convertIncomeDbToApiResource(dbIncomeDetails.details, authUser, logger);

  return apiResource;
};

const putDbIncome = (
  req: ApiResourceIncomeDetails,
  dbItem: DbItemExpense<DbDetailsIncome> | null,
  dbReceipts: DbDetailsReceipt[],
  incomeId: string,
  authUser: AuthorizeUser,
  transactWriter: dbutil.TransactionWriter,
  _logger: LoggerBase
) => {
  const logger = getLogger("putDbIncome", _logger);

  let formattedPurchaseDate = getFormattedExpenseDate(req.incomeDate, logger);

  const auditDetails = utils.updateAuditDetailsFailIfNotExists(dbItem?.details.auditDetails, authUser);

  const apiToDbDetails: DbDetailsIncome = {
    id: incomeId,
    billName: req.billName,
    incomeDate: formattedPurchaseDate,
    verifiedTimestamp: req.verifiedTimestamp,
    status: ExpenseStatus.ENABLE,
    amount: req.amount,
    incomeTypeId: req.incomeTypeId,
    paymentAccountId: req.paymentAccountId,
    receipts: dbReceipts,
    description: req.description,
    tags: req.tags,
    auditDetails: auditDetails,
    belongsTo: ExpenseBelongsTo.Income,
    recordType: ExpenseRecordType.Details,
  };

  const dbItemPrch: DbItemExpense<DbDetailsIncome> = {
    PK: getTablePkDetails(incomeId, logger),
    US_GSI_PK: getGsiPkDetails(authUser.userId, apiToDbDetails.status, logger),
    US_GSI_SK: getGsiSkIncomeDate(apiToDbDetails.incomeDate, logger),
    US_GSI_BELONGSTO: getGsiAttrDetailsIncomeBelongsTo(logger),
    details: apiToDbDetails,
  };

  transactWriter.putItems(dbItemPrch as unknown as JSONObject, ExpenseTableName, logger);
  return dbItemPrch;
};

/**
 * Queries Database for purchase details and purchase Items
 *
 * @param incomeId
 * @param authUser
 * @param _logger
 * @returns
 */
export const retrieveDbIncomeToApiResource = async (incomeId: string, authUser: AuthorizeUser, _logger: LoggerBase) => {
  const logger = getLogger("retrieveDbIncome", _logger);

  const incomeDetails = await retrieveDbIncomeDetails(incomeId, logger);

  if (!incomeDetails) {
    throw new InvalidError("income details is null");
  }
  const apiResource = await convertIncomeDbToApiResource(incomeDetails?.details, authUser, logger);
  return { apiResource, expenseDetails: incomeDetails };
};

export const retrieveDbIncomeDetails = async (incomeId: string, logger: LoggerBase) => {
  const cmdInput = {
    TableName: ExpenseTableName,
    Key: { PK: getTablePkDetails(incomeId, logger) },
  };
  const incomeOutput = await dbutil.getItem(cmdInput, logger);
  if (incomeOutput.Item) {
    logger.info("retrieved income from DB not null");
    return incomeOutput.Item as DbItemExpense<DbDetailsIncome>;
  }
  logger.info("retrieved income from DB is null");

  return null;
};
