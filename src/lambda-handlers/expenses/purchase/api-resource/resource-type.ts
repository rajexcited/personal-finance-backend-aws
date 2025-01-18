import { ApiResourceExpense } from "../../api-resource/resource-path";
import { ExpenseBelongsTo } from "../../base-config";

export interface ApiResourcePurchaseItemDetails {
  id: string;
  billName: string;
  amount: string;
  description: string;
  tags: string[];
  purchaseTypeId?: string;
}

export interface ApiResourcePurchaseDetails extends ApiResourceExpense {
  belongsTo: ExpenseBelongsTo.Purchase;
  amount?: string;
  description: string;
  purchaseTypeId: string;
  paymentAccountId?: string;
  purchaseDate: string;
  items: ApiResourcePurchaseItemDetails[];
}
