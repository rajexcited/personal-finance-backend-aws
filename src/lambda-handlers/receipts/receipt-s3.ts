import { MissingError } from "../apigateway";
import { ApiResourceExpense } from "../expenses/api-resource/resource-path";
import { getLogger, LoggerBase, s3utils } from "../utils";
import { DbDetailsReceipt, ExpenseReceiptsBucketName, getReceiptPathkey, getTempReceiptPathkey, ReceiptContentType } from "./base-config";
import { getReceiptFileHeadDetails } from "./details";
import { ReceiptActions } from "./receipt-actions";
import { v4 as uuidv4 } from "uuid";

const RECEIPT_S3_TAGS_TO_ADD: Record<string, string> = JSON.parse(process.env.RECEIPT_S3_TAGS_TO_ADD || "{}");

export const updateReceiptsIns3 = async (
  receiptActions: ReceiptActions,
  apiResource: ApiResourceExpense | null,
  expenseId: string,
  userId: string,
  _logger: LoggerBase
) => {
  const logger = getLogger("updateReceiptsIns3", _logger);

  const s3RemoveKeys = receiptActions.dbReceiptsToRemove.map((rct) => getReceiptPathkey(rct.id, expenseId, userId));
  await s3utils.addTags(ExpenseReceiptsBucketName, s3RemoveKeys, RECEIPT_S3_TAGS_TO_ADD, logger);

  if (!apiResource && receiptActions.requestReceiptsToAdd.length > 0) {
    throw new MissingError("api resource is missing, so cannot add receipts");
  }
  const dbAddReceiptPromises = receiptActions.requestReceiptsToAdd.map(async (req) => {
    const tempPath = getTempReceiptPathkey(req.name, apiResource?.id as string, userId);
    const headDetails = await getReceiptFileHeadDetails(tempPath, logger);
    const dbReceiptAdd: DbDetailsReceipt = {
      id: uuidv4(),
      name: req.name,
      contentType: headDetails?.ContentType as ReceiptContentType,
      size: headDetails?.ContentLength as number,
    };
    return dbReceiptAdd;
  });

  const dbAddReceipts = await Promise.all(dbAddReceiptPromises);

  const copyKeys = dbAddReceipts.map((rct) => {
    const keyMap: s3utils.SourceDestKeyMap = {
      sourceKey: getTempReceiptPathkey(rct.name, apiResource?.id as string, userId),
      destinationKey: getReceiptPathkey(rct.id, expenseId, userId),
    };
    return keyMap;
  });
  await s3utils.copyObjects(ExpenseReceiptsBucketName, null, copyKeys, logger);

  const undeleteKeys = receiptActions.dbReceiptsToReverseRemove.map((receipt) => getReceiptPathkey(receipt.id, expenseId, userId));
  await s3utils.deleteTags(ExpenseReceiptsBucketName, undeleteKeys, logger);

  return [...receiptActions.dbReceiptsWithNoChange, ...dbAddReceipts, ...receiptActions.dbReceiptsToReverseRemove];
};
