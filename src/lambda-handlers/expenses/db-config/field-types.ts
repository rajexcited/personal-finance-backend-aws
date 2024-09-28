import { AuditDetailsType } from "../../utils";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";

export const ExpenseTableName = process.env.EXPENSES_TABLE_NAME as string;
export const UserIdStatusIndex = process.env.EXPENSE_USERID_STATUS_GSI_NAME as string;

export enum ExpenseRecordType {
  Details = "details",
  Items = "items",
  Tags = "tags",
}

export interface DbDetailsType {
  id: string;
  belongsTo: ExpenseBelongsTo;
  auditDetails: AuditDetailsType;
  status: ExpenseStatus;
  recordType: ExpenseRecordType.Details;
}

export interface DbItemsType {
  id: string;
  auditDetails: AuditDetailsType;
  recordType: ExpenseRecordType.Items;
}

export interface DbTagsType {
  id: string;
  belongsTo: ExpenseBelongsTo;
  tags: string[];
  auditDetails: AuditDetailsType;
  recordType: ExpenseRecordType.Tags;
}

type GsiString<T extends DbDetailsType | DbTagsType | DbItemsType | null> = T extends DbItemsType ? undefined : string;
export interface DbItemExpense<T extends DbDetailsType | DbTagsType | DbItemsType | null> {
  PK: string;
  US_GSI_PK: GsiString<T>;
  US_GSI_SK: GsiString<T>;
  US_GSI_BELONGSTO: GsiString<T>;
  // ttl value in seconds
  ExpiresAt?: number;
  details: T;
}
