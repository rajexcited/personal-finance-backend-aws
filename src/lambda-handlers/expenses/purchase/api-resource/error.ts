import { ExpenseRequestResourcePath } from "../../api-resource";

enum PurchaseResourcePath {
  AMOUNT = "amount",
  PURCHASE_TYPE = "purchaseType",
  PAYMENT_ACCOUNT = "paymentAccount",
  PURCHASE_DATE = "purchaseDate",
  PURCHASE_ITEMS = "items",
}

export const PurchaseRequestResourcePath = { ...PurchaseResourcePath, ...ExpenseRequestResourcePath };
