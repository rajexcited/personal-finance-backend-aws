import { ExpenseBelongsTo } from "../expenses/base-config";

export enum FileExtension {
  JPG = "jpg",
  JPEG = "jpeg",
  PNG = "png",
  PDF = "pdf",
}

export enum ReceiptContentType {
  PNG = "image/png",
  JPG = "image/jpeg",
  PDF = "application/pdf",
}

export interface DbDetailsReceipt {
  id: string;
  name: string;
  contentType: ReceiptContentType;
  // size: number;
}

export interface ApiResourceReceipt {
  id: string;
  name: string;
  contentType: ReceiptContentType;
  relationId: string;
  belongsTo: ExpenseBelongsTo;
}

export const ExpenseReceiptsBucketName = process.env.EXPENSE_RECEIPTS_BUCKET_NAME as string;
export const ReceiptTempKeyPrefix = process.env.RECEIPT_TEMP_KEY_PREFIX as string;
export const ReceiptKeyPrefix = process.env.RECEIPT_KEY_PREFIX as string;

export const getTempReceiptPathkey = (belongsTo: ExpenseBelongsTo, receiptId: string, expenseId: string, userId: string) => {
  const receiptPath = [belongsTo, userId, expenseId, receiptId].join("/");
  return ReceiptTempKeyPrefix + receiptPath;
};

export const getReceiptPathkey = (belongsTo: ExpenseBelongsTo, receiptId: string, expenseId: string, userId: string) => {
  const receiptPath = [belongsTo, userId, expenseId, receiptId].join("/");
  return ReceiptKeyPrefix + receiptPath;
};
