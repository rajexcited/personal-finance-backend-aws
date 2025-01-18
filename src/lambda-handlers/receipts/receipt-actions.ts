import { ApiResourceExpense } from "../expenses/api-resource";
import { getLogger, LoggerBase } from "../utils";
import { ApiResourceReceipt, DbDetailsReceipt, getTempReceiptPathkey } from "./base-config";
import { getFileSize, getReceiptFileHeadDetails } from "./details";
import { isValidContentType, isValidFileSize, isValidPathKey } from "./validate";

export interface ReceiptActions {
  requestReceiptsToAdd: ApiResourceReceipt[];
  dbReceiptsToRemove: DbDetailsReceipt[];
  dbReceiptsWithNoChange: DbDetailsReceipt[];
  dbReceiptsToReverseRemove: DbDetailsReceipt[];
}

export const getReceiptActions = async (req: ApiResourceExpense, dbReceipts: DbDetailsReceipt[] | undefined, userId: string, _logger: LoggerBase) => {
  const logger = getLogger("getReceiptActions", _logger);

  /**
   * for update expense,
   *
   * find differences of receipts
   * if added, validate temp path, so can be copied to correct s3 path
   * if removed, set object expire time,
   * if no update, in other words db receipt item is matching with api request resource, do nothing
   */

  const dbReceiptsMapById: Record<string, DbDetailsReceipt> = {};
  dbReceipts?.forEach((rct) => (dbReceiptsMapById[rct.id] = rct));

  // request may have new and/or old receipts. removing null/undefined values
  const requestReceiptsId = req.receipts.map((rct) => rct.id).filter((id) => id);
  const dbReceiptsId = Object.keys(dbReceiptsMapById);

  // find request receipts to add. these are new uploaded
  const requestReceiptsToAdd: ApiResourceReceipt[] = req.receipts.filter((rct) => !dbReceiptsId.includes(String(rct.id)));
  // find db receipts to remove. these are deleted from existing expense.
  const dbReceiptsToRemove: DbDetailsReceipt[] = dbReceipts?.filter((rct) => !requestReceiptsId.includes(rct.id)) || [];
  // find request receipts that has no change. existing receipts in existing expense
  const dbReceiptsWithNoChange: DbDetailsReceipt[] = dbReceipts?.filter((rct) => requestReceiptsId.includes(rct.id)) || [];

  const invalidReceiptCountReducer = async (previousValue: Promise<number>, rct: ApiResourceReceipt) => {
    const prevCount = await previousValue;

    const tempPath = getTempReceiptPathkey(req.belongsTo, rct.id, req.id as string, userId);
    const isValidPath = await isValidPathKey(tempPath, logger);
    if (isValidPath) {
      const isValidType = await isValidContentType(tempPath, logger);
      if (isValidType) {
        const fileSize = await getFileSize(tempPath, logger);
        if (isValidFileSize(fileSize)) {
          return prevCount;
        }
      }
    }

    logger.warn("found invalid add action. receipt resource=", rct);
    return prevCount + 1;
  };

  const invalidReqReceiptsToAddCount = await requestReceiptsToAdd.reduce<Promise<number>>(invalidReceiptCountReducer, Promise.resolve(0));

  if (invalidReqReceiptsToAddCount > 0) {
    logger.warn("invalidReqReceiptsToAddCount =", invalidReqReceiptsToAddCount);
    return null;
  }

  // find if any receipts matching to existing db receipts, if so remove from addlist and insert to nochange list
  const matchedDbReceiptsFoundinReqAddPromises = requestReceiptsToAdd.map(async (rct) => {
    const tempPath = getTempReceiptPathkey(req.belongsTo, rct.id, req.id, userId);
    const headDetails = await getReceiptFileHeadDetails(tempPath, logger);
    const matchedDbRct = dbReceipts?.find((dbrct) => headDetails?.ContentType === dbrct.contentType && dbrct.name === rct.name);

    if (matchedDbRct) {
      return { db: matchedDbRct, req: rct };
    }
    return null;
  });

  const matchedDbReceiptsFoundinReqAdd = await Promise.all(matchedDbReceiptsFoundinReqAddPromises);
  const actions: ReceiptActions = {
    requestReceiptsToAdd: requestReceiptsToAdd.filter((rct) => !matchedDbReceiptsFoundinReqAdd.find((mdr) => mdr?.req === rct)),
    dbReceiptsToRemove: dbReceiptsToRemove.filter((rct) => !matchedDbReceiptsFoundinReqAdd.find((mdr) => mdr?.db === rct)),
    dbReceiptsWithNoChange: dbReceiptsWithNoChange.concat(
      matchedDbReceiptsFoundinReqAdd.map((mdr) => mdr?.db).filter((rct) => !!rct) as DbDetailsReceipt[]
    ),
    dbReceiptsToReverseRemove: [],
  };
  return actions;
};
