import { caching } from "cache-manager";
import { getLogger, LoggerBase, s3utils } from "../utils";
import { ExpenseReceiptsBucketName } from "./base-config";
import ms from "ms";

export const RECEIPTS_MAX_ALLOWED = 5;

const receiptHeadDetailsMemoryCache = caching("memory", {
  max: RECEIPTS_MAX_ALLOWED * 2,
  ttl: ms("30 sec"),
});

export const getReceiptFileHeadDetails = async (s3Key: string, _logger: LoggerBase) => {
  const receiptHeadDetailsCache = await receiptHeadDetailsMemoryCache;
  const logger = getLogger("getReceiptFileHeadDetails", _logger);
  const detailsPromise = receiptHeadDetailsCache.wrap(s3Key, async () => {
    logger.debug("cache miss, calling api");
    const output = s3utils.headObject(ExpenseReceiptsBucketName, s3Key, logger);
    return output;
  });
  return await detailsPromise;
};

export const getFileSize = async (s3Key: string, _logger: LoggerBase) => {
  const logger = getLogger("getFileSize", _logger);
  const headOutput = await getReceiptFileHeadDetails(s3Key, logger);
  return headOutput?.ContentLength || 0;
};
