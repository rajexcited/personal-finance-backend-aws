import { ApiResourceExpense } from "../../api-resource/resource-path";
import { ExpenseBelongsTo } from "../../base-config";

export interface ApiResourceIncomeDetails extends ApiResourceExpense {
  belongsTo: ExpenseBelongsTo.Income;
  amount: string;
  paymentAccountId?: string;
  incomeDate: string;
  incomeTypeId: string;
}
