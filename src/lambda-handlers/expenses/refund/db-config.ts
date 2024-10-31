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

export interface DbDetailsRefund extends DbDetailsType {
  billName: string;
  amount: string;
  description: string;
  tags: string[];
  paymentAccountId: string;
  refundDate: string;
  verifiedTimestamp?: string;
  receipts: DbDetailsReceipt[];
  status: ExpenseStatus;
  belongsTo: ExpenseBelongsTo.Refund;
  purchaseId?: string;
  reasonId: string;
  personIds: string[];
}

export const getTablePkDetails = (refundId: string, _logger: LoggerBase) => {
  return getTablePkExpenseDetails(refundId, ExpenseBelongsTo.Refund, _logger);
};

export const getTablePkTags = (refundId: string, _logger: LoggerBase) => {
  return getTablePkExpenseTags(refundId, ExpenseBelongsTo.Refund, _logger);
};

export const getGsiPkTags = (userId: string, status: ExpenseStatus, _logger: LoggerBase) => {
  return getGsiPkExpenseTags(userId, status, ExpenseBelongsTo.Refund, _logger);
};

export const getGsiSkTagsIncomeYear = (refundDateOrYear: string | number, _logger: LoggerBase) => {
  return getGsiSkTagsYear(refundDateOrYear, _logger);
};

export const getGsiSkRefundDate = (refundDate: string | undefined | null, _logger: LoggerBase) => {
  return getGsiSkDetailsExpenseDate(refundDate, _logger);
};

export const getGsiAttrDetailsRefundBelongsTo = (_logger: LoggerBase) => {
  return getGsiAttrDetailsBelongsTo(ExpenseBelongsTo.Refund, _logger);
};
