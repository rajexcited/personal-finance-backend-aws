import { dbutil, LoggerBase } from "../../utils";
import { DbItemExpense, ExpenseTableName } from "../db-config";
import { ExpenseBelongsTo, ExpenseStatus } from "../../expenses/base-config";
import {
  DbDetailsType,
  DbItemsType,
  getGsiAttrDetailsBelongsTo,
  getGsiSkDetailsExpenseDate,
  getGsiSkTagsYear,
  ExpenseRecordType,
  getTablePK,
  getTablePkExpenseDetails,
  getTablePkExpenseTags,
  getGsiPkExpenseTags,
} from "../../expenses/db-config";
import { DbDetailsReceipt } from "../../receipts";

export interface DbDetailsPurchaseItem extends DbItemsType {
  items: DbPurchaseItemDetails[];
}

export interface DbPurchaseItemDetails {
  id: string;
  billName: string;
  amount: string;
  description: string;
  tags: string[];
  purchaseTypeId?: string;
}

export interface DbDetailsPurchase extends DbDetailsType {
  billName: string;
  amount?: string;
  description: string;
  purchaseTypeId: string;
  paymentAccountId?: string;
  purchaseDate: string;
  verifiedTimestamp?: string;
  receipts: DbDetailsReceipt[];
  tags: string[];
  belongsTo: ExpenseBelongsTo.Purchase;
}

export const getTablePkDetails = (purchaseId: string, _logger: LoggerBase) => {
  return getTablePkExpenseDetails(purchaseId, ExpenseBelongsTo.Purchase, _logger);
};

export const getTablePkItems = (purchaseId: string, _logger: LoggerBase) => {
  return getTablePK(purchaseId, ExpenseBelongsTo.Purchase, ExpenseRecordType.Items, _logger);
};

export const getTablePkTags = (purchaseId: string, _logger: LoggerBase) => {
  return getTablePkExpenseTags(purchaseId, ExpenseBelongsTo.Purchase, _logger);
};

export const getGsiPkTags = (userId: string, status: ExpenseStatus, _logger: LoggerBase) => {
  return getGsiPkExpenseTags(userId, status, ExpenseBelongsTo.Purchase, _logger);
};

export const getGsiSkTagsPurchaseYear = (purchaseDateOrYear: string | number, _logger: LoggerBase) => {
  return getGsiSkTagsYear(purchaseDateOrYear, _logger);
};

export const getGsiSkPurchaseDate = (purchaseDate: string | Date | undefined | null, _logger: LoggerBase) => {
  return getGsiSkDetailsExpenseDate(purchaseDate, _logger);
};

export const getGsiAttrDetailsPurchaseBelongsTo = (_logger: LoggerBase) => {
  return getGsiAttrDetailsBelongsTo(ExpenseBelongsTo.Purchase, _logger);
};
