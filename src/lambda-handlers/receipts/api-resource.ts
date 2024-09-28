import { IllegelArgumentError } from "../apigateway";
import { getLogger, LoggerBase } from "../utils";
import { ApiResourceReceipt, DbDetailsReceipt } from "./base-config";

export const convertReceiptDbToApiResource = (dbReceipt: DbDetailsReceipt | null, expenseId: string | null, _logger: LoggerBase) => {
  const logger = getLogger("convertDbReceiptToApiResource", _logger);
  if (!dbReceipt) {
    throw new IllegelArgumentError("dbReceipt is null");
  }
  if (!expenseId) {
    throw new IllegelArgumentError("expenseId is null");
  }

  const apiReceipt: ApiResourceReceipt = {
    id: dbReceipt.id,
    name: dbReceipt.name,
    contentType: dbReceipt.contentType,
    expenseId: expenseId,
    size: dbReceipt.size,
  };

  return apiReceipt;
};
