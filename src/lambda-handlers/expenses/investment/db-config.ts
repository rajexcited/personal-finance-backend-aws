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

export interface DbDetailsInvestment extends DbDetailsType {
  billName: string;
  portfolioName: string;
  amount: string;
  description: string;
  tags: string[];
  paymentAccountId?: string;
  fundingAccountId: string;
  investmentDate: string;
  maturityDate: string;
  goals: string[];
  targetYear: string;
  interestRate: string;
  verifiedTimestamp?: string;
  receipts: DbDetailsReceipt[];
  status: ExpenseStatus;
  belongsTo: ExpenseBelongsTo.Investment;
  investmentTypeId: string;
  personIds: string[];
}

export const getTablePkDetails = (investmentId: string, _logger: LoggerBase) => {
  return getTablePkExpenseDetails(investmentId, ExpenseBelongsTo.Investment, _logger);
};

export const getTablePkTags = (investmentId: string, _logger: LoggerBase) => {
  return getTablePkExpenseTags(investmentId, ExpenseBelongsTo.Investment, _logger);
};

export const getGsiPkTags = (userId: string, status: ExpenseStatus, _logger: LoggerBase) => {
  return getGsiPkExpenseTags(userId, status, ExpenseBelongsTo.Investment, _logger);
};

export const getGsiSkTagsIncomeYear = (investmentDateOrYear: string | number, _logger: LoggerBase) => {
  return getGsiSkTagsYear(investmentDateOrYear, _logger);
};

export const getGsiSkRefundDate = (investmentDate: string | undefined | null, _logger: LoggerBase) => {
  return getGsiSkDetailsExpenseDate(investmentDate, _logger);
};

export const getGsiAttrDetailsRefundBelongsTo = (_logger: LoggerBase) => {
  return getGsiAttrDetailsBelongsTo(ExpenseBelongsTo.Investment, _logger);
};
