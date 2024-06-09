import { LoggerBase, getLogger, s3utils } from "../utils";
import { _receiptTempKeyPrefix, _expenseReceiptsBucketName, getReceiptPathkey } from "./base-config";
import { ApiExpenseResource, ApiReceiptResource, DbItemExpense, DbReceiptDetails, ReceiptContentType } from "./resource-type";
import { caching } from "cache-manager";
import { RECEIPTS_MAX_ALLOWED, isValidFileSize } from "./validate";
import { v4 as uuidv4 } from "uuid";
import { MissingError } from "../apigateway";

const RECEIPT_S3_TAGS_TO_ADD: Record<string, string> = JSON.parse(process.env.RECEIPT_S3_TAGS_TO_ADD || "{}");

const receiptHeadDetailsMemoryCache = caching("memory", {
  max: RECEIPTS_MAX_ALLOWED * 2,
  ttl: 30 * 1000,
});

export interface ReceiptActions {
  requestReceiptsToAdd: ApiReceiptResource[];
  dbReceiptsToRemove: DbReceiptDetails[];
  dbReceiptsWithNoChange: DbReceiptDetails[];
  dbReceiptsToReverseRemove: DbReceiptDetails[];
}

export const getReceiptActions = async (req: ApiExpenseResource, dbItem: DbItemExpense | null, userId: string, _logger: LoggerBase) => {
  const logger = getLogger("getReceiptActions", _logger);

  /**
   * for update expense,
   *
   * find differences of receipts
   * if added, validate temp path, so can be copied to correct s3 path
   * if removed, set object expire time,
   * if no update, in other words db receipt item is matching with api request resource, do nothing
   */
  type DbReceiptMap = { [id: string]: DbReceiptDetails };
  const dbReceiptsMapById: DbReceiptMap = {};
  dbItem?.details.receipts.forEach((rct) => (dbReceiptsMapById[rct.id] = rct));

  // request may have new and/or old receipts. removing null/undefined values
  const requestReceiptsId = req.receipts.map((rct) => rct.id).filter((id) => id);
  const dbReceiptsId = Object.keys(dbReceiptsMapById);

  // find request receipts to add. these are new uploaded
  const requestReceiptsToAdd: ApiReceiptResource[] = req.receipts.filter((rct) => !dbReceiptsId.includes(String(rct.id)));
  // find db receipts to remove. these are deleted from existing expense.
  const dbReceiptsToRemove: DbReceiptDetails[] = dbItem?.details.receipts.filter((rct) => !requestReceiptsId.includes(rct.id)) || [];
  // find request receipts that has no change. existing receipts in existing expense
  const dbReceiptsWithNoChange: DbReceiptDetails[] = dbItem?.details.receipts.filter((rct) => requestReceiptsId.includes(rct.id)) || [];

  const invalidReceiptCountReducer = async (previousValue: Promise<number>, rct: ApiReceiptResource) => {
    const prevCount = await previousValue;

    const tempPath = getTempReceiptPathkey(rct.name, req.id as string, userId);
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
    const tempPath = getTempReceiptPathkey(rct.name, req.id as string, userId);
    const headDetails = await getReceiptFileHeadDetails(tempPath, logger);
    const matchedDbRct = dbItem?.details.receipts
      .filter((dbrct) => dbrct.name === rct.name)
      .find((dbrct) => headDetails?.ContentType === dbrct.contentType && headDetails.ContentLength === dbrct.size);

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
      matchedDbReceiptsFoundinReqAdd.map((mdr) => mdr?.db).filter((rct) => !!rct) as DbReceiptDetails[]
    ),
    dbReceiptsToReverseRemove: [],
  };
  return actions;
};

export const updateReceiptsIns3 = async (
  receiptActions: ReceiptActions,
  apiResource: ApiExpenseResource | null,
  expenseId: string,
  userId: string,
  _logger: LoggerBase
) => {
  const logger = getLogger("updateReceiptsIns3", _logger);

  const s3RemoveKeys = receiptActions.dbReceiptsToRemove.map((rct) => getReceiptPathkey(rct.id, expenseId, userId));
  await s3utils.addTags(_expenseReceiptsBucketName, s3RemoveKeys, RECEIPT_S3_TAGS_TO_ADD, logger);

  if (!apiResource && receiptActions.requestReceiptsToAdd.length > 0) {
    throw new MissingError("api resource is missing, so cannot add receipts");
  }
  const dbAddReceiptPromises = receiptActions.requestReceiptsToAdd.map(async (req) => {
    const tempPath = getTempReceiptPathkey(req.name, apiResource?.id as string, userId);
    const headDetails = await getReceiptFileHeadDetails(tempPath, logger);
    const dbReceiptAdd: DbReceiptDetails = {
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
  await s3utils.copyObjects(_expenseReceiptsBucketName, null, copyKeys, logger);

  const undeleteKeys = receiptActions.dbReceiptsToReverseRemove.map((receipt) => getReceiptPathkey(receipt.id, expenseId, userId));
  await s3utils.deleteTags(_expenseReceiptsBucketName, undeleteKeys, logger);

  return [...receiptActions.dbReceiptsWithNoChange, ...dbAddReceipts, ...receiptActions.dbReceiptsToReverseRemove];
};

const getTempReceiptPathkey = (fileName: string, expenseId: string, userId: string) => {
  const tempPath = [_receiptTempKeyPrefix, userId, expenseId, fileName].join("/");
  return tempPath;
};

const isValidPathKey = async (s3Key: string, _logger: LoggerBase) => {
  const logger = getLogger(`isValidPathKey.name.${s3Key.split("/").slice(-1)}`, _logger);
  const headOutput = await getReceiptFileHeadDetails(s3Key, logger);
  if (headOutput?.ContentLength && headOutput.LastModified) {
    return true;
  }
  return false;
};

const isValidContentType = async (s3Key: string, _logger: LoggerBase) => {
  const logger = getLogger("isValidContentType", _logger);
  const headOutput = await getReceiptFileHeadDetails(s3Key, logger);
  if (
    headOutput?.ContentType === ReceiptContentType.JPG ||
    headOutput?.ContentType === ReceiptContentType.PNG ||
    headOutput?.ContentType === ReceiptContentType.PDF
  ) {
    return true;
  }
  return false;
};

const getFileSize = async (s3Key: string, _logger: LoggerBase) => {
  const logger = getLogger("getFileSize", _logger);
  const headOutput = await getReceiptFileHeadDetails(s3Key, logger);
  return headOutput?.ContentLength || 0;
};

export const getReceiptFileHeadDetails = async (s3Key: string, _logger: LoggerBase) => {
  const receiptHeadDetailsCache = await receiptHeadDetailsMemoryCache;
  const logger = getLogger("getReceiptFileHeadDetails", _logger);
  const detailsPromise = receiptHeadDetailsCache.wrap(s3Key, async () => {
    logger.debug("cache miss, calling api");
    const output = s3utils.headObject(_expenseReceiptsBucketName, s3Key, logger);
    return output;
  });
  return await detailsPromise;
};
