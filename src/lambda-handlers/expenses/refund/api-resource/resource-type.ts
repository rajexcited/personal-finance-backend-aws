import { ApiResourceExpense } from "../../api-resource/resource-path";
import { ExpenseBelongsTo } from "../../base-config";

export interface ApiResourceRefundDetails extends ApiResourceExpense {
  belongsTo: ExpenseBelongsTo.Refund;
  amount: string;
  paymentAccountId?: string;
  refundDate: string;
  purchaseId?: string;
  reasonId: string;
}
