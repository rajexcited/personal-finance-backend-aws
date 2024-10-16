import { ApiResourceReceipt } from "../../receipts";
import { AuditDetailsType } from "../../utils";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";

export interface ApiResourceExpense {
  id: string;
  billName: string;
  description: string;
  tags: string[];
  verifiedTimestamp?: string;
  belongsTo: ExpenseBelongsTo;
  receipts: ApiResourceReceipt[];
  auditDetails: AuditDetailsType;
  status: ExpenseStatus;
  personIds: string[];
  profileId: string;
}
