import { ApiResourceExpense } from "../../api-resource/resource-path";
import { ExpenseBelongsTo } from "../../base-config";

export interface ApiResourceInvestmentDetails extends ApiResourceExpense {
  portfolioName: string;
  amount: string;
  paymentAccountId?: string;
  fundingAccountId: string;
  investmentDate: string;
  maturityDate: string;
  goals: string[];
  targetYear: string;
  interestRate: string;
  investmentTypeId: string;
  belongsTo: ExpenseBelongsTo.Investment;
}
