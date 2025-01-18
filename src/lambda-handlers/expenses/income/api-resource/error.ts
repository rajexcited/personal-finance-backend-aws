import { ExpenseRequestResourcePath } from "../../api-resource";

enum IncomeResourcePath {
  AMOUNT = "amount",
  INCOME_TYPE = "incomeType",
  PAYMENT_ACCOUNT = "paymentAccount",
  INCOME_DATE = "incomeDate",
  PURCHASE = "purchase",
}

export const IncomeRequestResourcePath = { ...IncomeResourcePath, ...ExpenseRequestResourcePath };
