import { ExpenseBelongsTo } from "../expenses/base-config";
import { getLogger, LoggerBase, validations } from "../utils";
import { ApiResourceReceipt, FileExtension, ReceiptContentType } from "./base-config";
import { getReceiptFileHeadDetails, RECEIPTS_MAX_ALLOWED } from "./details";

const FILENAME_MIN_LENGTH = 2;
const FILENAME_MAX_LENGTH = 50;
const ONE_KB = 1024;
const ONE_MB = 1024 * ONE_KB;
/** max allowed file size is 10 MB due to s3 integration api gateway restriction */
const FILESIZE_MAX_BYTES = 10 * ONE_MB;

export const isValidFilename = (fileName?: string | null) => {
  // filename can either have extension or not.
  const filenameWithoutExtension = splitFilenameAndExtension(fileName).name;
  if (!filenameWithoutExtension) return false;
  if (!validations.isValidLength(filenameWithoutExtension, FILENAME_MIN_LENGTH, FILENAME_MAX_LENGTH)) return false;
  const fileNameRegex = new RegExp("[\\w\\s-+\\.,@#$%^&]+");

  return fileNameRegex.test(filenameWithoutExtension);
};

export const isValidFileExtension = (fileName?: string | null) => {
  // filename with or without extension. or simply file extension
  const extension = splitFilenameAndExtension(fileName).extension;
  // extension is optional. if present it must be one of acceptable values
  if (
    extension &&
    extension !== FileExtension.JPG &&
    extension !== FileExtension.JPEG &&
    extension !== FileExtension.PDF &&
    extension !== FileExtension.PNG
  ) {
    return false;
  }
  return true;
};

const splitFilenameAndExtension = (filename?: string | null) => {
  let extension = null;
  let name = filename || null;
  if (filename) {
    const parts = filename.split(".");
    if (parts.length > 1) {
      name = parts.slice(0, -1).join(".");
      extension = parts.slice(-1)[0];
    }
  }
  return {
    name,
    extension,
  };
};

export const isValidReceiptType = (receiptType?: string | ReceiptContentType | null) => {
  if (!receiptType) return false;
  if (receiptType !== ReceiptContentType.JPG && receiptType !== ReceiptContentType.PNG && receiptType !== ReceiptContentType.PDF) {
    return false;
  }
  return true;
};

export const isValidFileSize = (size?: number | null) => {
  if (typeof size !== "number") return false;
  return size > ONE_KB && size < FILESIZE_MAX_BYTES;
};

export const areValidReceipts = (
  receipts: ApiResourceReceipt[] | null | undefined,
  expenseId: string | undefined,
  belongsTo: ExpenseBelongsTo,
  _logger: LoggerBase
) => {
  const logger = getLogger("areValidReceipts", _logger);
  if (!receipts) return false;
  if (!Array.isArray(receipts) || receipts.length > RECEIPTS_MAX_ALLOWED) return false;
  if (!expenseId && receipts.length > 0) return false;

  const validReceipts = receipts.filter((rct) => {
    if (!isValidFilename(rct.name)) return false;
    if (!isValidFileExtension(rct.name)) return false;

    if (!isValidReceiptType(rct.contentType)) return false;
    if (!validations.isValidUuid(rct.id)) return false;

    if (rct.relationId !== expenseId) return false;
    if (rct.belongsTo !== belongsTo) return false;

    return true;
  });

  logger.debug("validReceipts.length=", validReceipts.length, ", receipts.length =", receipts.length, ", validReceipts=", validReceipts);
  return validReceipts.length === receipts.length;
};

export const isValidPathKey = async (s3Key: string, _logger: LoggerBase) => {
  const logger = getLogger(`isValidPathKey.name.${s3Key.split("/").slice(-1)}`, _logger);
  const headOutput = await getReceiptFileHeadDetails(s3Key, logger);
  if (headOutput?.ContentLength && headOutput.LastModified) {
    return true;
  }
  return false;
};

export const isValidContentType = async (s3Key: string, _logger: LoggerBase) => {
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
