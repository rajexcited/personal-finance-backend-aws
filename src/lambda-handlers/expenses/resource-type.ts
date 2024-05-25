import { AuditDetailsType } from "../utils";
import { ExpenseStatus } from "./base-config";

export interface DbItemExpense {
  PK: string;
  UD_GSI_PK: string;
  UD_GSI_SK: string;
  UD_GSI_ATTR1: string;
  // ttl value in seconds
  ExpiresAt?: number;
  details: DbExpenseDetails;
}

export interface DbItemExpenseItem {
  PK: string;
  // ttl value in seconds
  ExpiresAt?: number;
  details: DbExpenseItemsDetails;
}

export interface DbExpenseDetailsBase {
  id: string;
  billName: string;
  amount?: string;
  expenseCategoryId?: string;
  description?: string;
  tags: string[];
}

export interface DbExpenseDetails extends DbExpenseDetailsBase {
  purchasedDate: string;
  verifiedTimestamp?: string;
  paymentAccountId?: string;
  receipts: DbReceiptDetails[];
  status: ExpenseStatus;
  auditDetails: AuditDetailsType;
  deletedTimestamp?: string;
}

export enum ReceiptContentType {
  PNG = "image/png",
  JPG = "image/jpeg",
  PDF = "application/pdf",
}

export interface DbReceiptDetails {
  id: string;
  contentType: ReceiptContentType;
  name: string;
  size: number;
}

export interface DbExpenseItemsDetails {
  expenseId: string;
  items: DbExpenseItemDetails[];
}

export interface DbExpenseItemDetails extends DbExpenseDetailsBase {}

export interface ApiExpenseResourceBase {
  id?: string;
  billName: string;
  amount?: string;
  expenseCategoryId?: string;
  description?: string;
  tags: string[];
}

export interface ApiReceiptResource {
  name: string;
  id?: string | null;
  size?: number;
  contentType: ReceiptContentType;
}

export interface ApiExpenseItemResource extends ApiExpenseResourceBase {}

export interface ApiExpenseResource extends ApiExpenseResourceBase {
  purchasedDate: string;
  verifiedTimestamp?: string;
  paymentAccountId?: string;
  receipts: ApiReceiptResource[];
  status?: ExpenseStatus;
  auditDetails?: AuditDetailsType;
  expenseItems?: ApiExpenseItemResource[];
  deletedTimestamp?: string;
}
