export const _expenseReceiptsBucketName = process.env.EXPENSE_RECEIPTS_BUCKET_NAME as string;
const RECEIPT_TEMP_KEY = "temp";

export const getTempReceiptPathkey = (receiptId: string, userId?: string) => {
  const parts = [RECEIPT_TEMP_KEY, receiptId];
  if (userId) {
    return [userId, ...parts].join("/");
  }
  return parts.join("/");
};

export const getReceiptPathkey = (receiptId: string, expenseId: string, userId?: string) => {
  const parts = [expenseId, receiptId];
  if (userId) {
    return [userId, ...parts].join("/");
  }
  return parts.join("/");
};
