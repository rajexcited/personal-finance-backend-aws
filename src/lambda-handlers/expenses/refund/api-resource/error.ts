import { ExpenseRequestResourcePath } from "../../api-resource";

enum RefundResourcePath {
  AMOUNT = "amount",
  REASON = "reason",
  PAYMENT_ACCOUNT = "paymentAccount",
  REFUND_DATE = "refundDate",
  PURCHASE = "purchase",
}

export const RefundRequestResourcePath = { ...RefundResourcePath, ...ExpenseRequestResourcePath };
