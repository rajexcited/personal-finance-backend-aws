import { LoggerBase } from "../../utils";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";
import {
  DbDetailsType,
  getGsiAttrDetailsBelongsTo,
  getGsiSkDetailsExpenseDate,
  getTablePkExpenseDetails,
  getTablePkExpenseTags,
  getGsiPkExpenseTags,
  getGsiSkTagsYear,
} from "../db-config";
import { DbDetailsReceipt } from "../../receipts";

export interface DbDetailsIncome extends DbDetailsType {
  billName: string;
  amount: string;
  description: string;
  tags: string[];
  paymentAccountId: string;
  incomeDate: string;
  verifiedTimestamp?: string;
  receipts: DbDetailsReceipt[];
  belongsTo: ExpenseBelongsTo.Income;
  incomeTypeId: string;
  personIds: string[];
}

export const getTablePkDetails = (incomeId: string, _logger: LoggerBase) => {
  return getTablePkExpenseDetails(incomeId, ExpenseBelongsTo.Income, _logger);
};

export const getTablePkTags = (incomeId: string, _logger: LoggerBase) => {
  return getTablePkExpenseTags(incomeId, ExpenseBelongsTo.Income, _logger);
};

export const getGsiPkTags = (userId: string, status: ExpenseStatus, _logger: LoggerBase) => {
  return getGsiPkExpenseTags(userId, status, ExpenseBelongsTo.Income, _logger);
};

export const getGsiSkTagsIncomeYear = (incomeDateOrYear: string | number, _logger: LoggerBase) => {
  return getGsiSkTagsYear(incomeDateOrYear, _logger);
};

export const getGsiSkIncomeDate = (incomeDate: string | undefined | null, _logger: LoggerBase) => {
  return getGsiSkDetailsExpenseDate(incomeDate, _logger);
};

export const getGsiAttrDetailsIncomeBelongsTo = (_logger: LoggerBase) => {
  return getGsiAttrDetailsBelongsTo(ExpenseBelongsTo.Income, _logger);
};
