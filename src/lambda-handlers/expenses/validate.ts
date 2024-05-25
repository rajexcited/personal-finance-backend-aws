import { InvalidField } from "../apigateway";
import { isValidExpenseCategoryId } from "../config-type";
import { isValidPaymentAccount } from "../pymt-acc";
import { LoggerBase, getLogger, validations } from "../utils";
import { ErrorMessage, ExpenseResourcePath, FileExtension, GSI_ATTR_DATE_FORMAT, _expenseTableName, _logger } from "./base-config";
import { ApiExpenseItemResource, ApiExpenseResource, ApiReceiptResource, ReceiptContentType } from "./resource-type";

export const BILLNAME_MAX_LENGTH = 50;
export const NAME_MIN_LENGTH = 2;

const AMOUNT_MIN = -10000000;
const AMOUNT_MAX = 10000000;

export const RECEIPTS_MAX_ALLOWED = 5;

const FILENAME_MIN_LENGTH = 2;
const FILENAME_MAX_LENGTH = 50;
const ONE_KB = 1024;
const ONE_MB = 1024 * ONE_KB;
/** max allowed file size is 10 MB due to s3 integration api gateway restriction */
const FILESIZE_MAX_BYTES = 10 * ONE_MB;

export const isValidBillName = (billName: string | undefined | null) => {
  const validLength = validations.isValidLength(billName, NAME_MIN_LENGTH, BILLNAME_MAX_LENGTH);
  if (!validLength) return false;

  const billNameRegex = new RegExp("^[\\w\\s\\.@#\\$&\\+!-]+$");
  return billNameRegex.test(billName as string);
};

export const isValidAmount = (amount: number | string | undefined | null) => {
  if (!amount) return false;
  const amt = Number(amount);
  if (isNaN(amt)) return false;

  const amtstr = String(amount);
  const parts = amtstr.split(".");
  if (parts.length > 2) return false;
  if (parts[1]?.length > 2) return false;

  return amt < AMOUNT_MAX && amt > AMOUNT_MIN;
};

export const isValidPurchaseDate = (purchaseDate: string | undefined | null) => {
  const logger = getLogger("isValidPurchaseDate", _logger);
  if (validations.isValidDate(purchaseDate, logger, GSI_ATTR_DATE_FORMAT)) {
    return true;
  }
  if (validations.isValidDate(purchaseDate, logger)) {
    return true;
  }
  return false;
};

export const areValidReceipts = (receipts: ApiReceiptResource[] | null | undefined, expenseId: string | undefined, _logger: LoggerBase) => {
  const logger = getLogger("isValidReceipts", _logger);
  if (!receipts) return false;
  if (receipts.length > RECEIPTS_MAX_ALLOWED) return false;
  if (!expenseId && receipts.length > 0) return false;

  const invalidReceipts = receipts.filter((rct) => {
    if (!isValidFilename(rct.name)) return true;
    if (!isValidFileExtension(rct.name)) return true;

    if (rct.contentType && !isValidReceiptType(rct.contentType)) return true;
    if (rct.id && !validations.isValidUuid(rct.id)) return true;
    if (rct.size && !isValidFileSize(rct.size)) return true;

    return false;
  });

  logger.debug("invalidReceipts.length=", invalidReceipts.length, ", invalidReceipts=", invalidReceipts);
  return invalidReceipts.length === 0;
};

export const validateExpenseItems = async (
  expenseItems: ApiExpenseItemResource[],
  invalidFields: InvalidField[],
  userId: string,
  _logger: LoggerBase
) => {
  const logger = getLogger("validateExpenseItems", _logger);

  const invalidExpItms = expenseItems.filter((ei) => {
    if (ei.id && !validations.isValidUuid(ei.id)) return true;
    if (ei.amount && !isValidAmount(ei.amount)) return true;
    if (ei.description && !validations.isValidDescription(ei.description)) return true;
    if (!isValidBillName(ei.billName)) return true;
    if (!validations.areTagsValid(ei.tags)) return true;
    if (ei.expenseCategoryId && !validations.isValidUuid(ei.expenseCategoryId)) return true;

    return false;
  });

  logger.warn("invalidExpItms.length =", invalidExpItms.length, ", invalidExpItms =", invalidExpItms);
  if (invalidExpItms.length > 0) {
    invalidFields.push({ path: ExpenseResourcePath.EXPENSE_ITEMS, message: ErrorMessage.INCORRECT_VALUE });
    return;
  }

  const validExpItmsCategoryPromises = expenseItems.map(async (ei) => {
    if (!ei.expenseCategoryId) {
      return true;
    }
    const isValidExpnseCategory = await isValidExpenseCategoryId(ei.expenseCategoryId, userId, logger);
    return isValidExpnseCategory;
  });
  const validExpItmsCategories = await Promise.all(validExpItmsCategoryPromises);
  logger.info("validExpItmsCategories.length =", validExpItmsCategories.length, "; validExpItmsCategoriesResult =", validExpItmsCategories);

  const invalidExpItmsCategory = validExpItmsCategories.find((isValid) => !isValid);
  if (invalidExpItmsCategory !== undefined) {
    invalidFields.push({
      path: ExpenseResourcePath.EXPENSE_ITEMS + "." + ExpenseResourcePath.EXPENSE_CATEGORY,
      message: ErrorMessage.INCORRECT_VALUE,
    });
  }
};

export const validateTags = (req: ApiExpenseResource, invalidFields: InvalidField[], logger: LoggerBase) => {
  if (!req.tags) {
    invalidFields.push({ path: ExpenseResourcePath.TAGS, message: ErrorMessage.MISSING_VALUE });
  }
  if (req.tags.length > validations.DEFAULT_MAX_ALLOWED_TAGS) {
    invalidFields.push({ path: ExpenseResourcePath.TAGS, message: ErrorMessage.LIMIT_EXCEEDED });
  }
  const inValidTags = req.tags.filter((tag) => !validations.isValidTag(tag));
  if (!validations.areTagsValid(req.tags)) {
    logger.info("inValidTags =", inValidTags);
    invalidFields.push({ path: ExpenseResourcePath.TAGS, message: "invalid tags [" + inValidTags + "]" });
  }
};

export const validateExpenseCategory = async (req: ApiExpenseResource, invalidFields: InvalidField[], userId: string, logger: LoggerBase) => {
  if (req.expenseCategoryId) {
    if (!validations.isValidUuid(req.expenseCategoryId)) {
      invalidFields.push({ path: ExpenseResourcePath.EXPENSE_CATEGORY, message: ErrorMessage.INCORRECT_FORMAT });
    } else {
      const isValidExpnseCategory = await isValidExpenseCategoryId(req.expenseCategoryId, userId, logger);
      if (!isValidExpnseCategory) {
        invalidFields.push({ path: ExpenseResourcePath.EXPENSE_CATEGORY, message: ErrorMessage.INCORRECT_VALUE });
      }
    }
  }
};

export const validatePaymentAccount = async (req: ApiExpenseResource, invalidFields: InvalidField[], userId: string, logger: LoggerBase) => {
  if (req.paymentAccountId) {
    if (!validations.isValidUuid(req.paymentAccountId)) {
      invalidFields.push({ path: ExpenseResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_FORMAT });
    } else {
      const isValidPymtAccId = await isValidPaymentAccount(req.paymentAccountId, userId, logger);
      if (!isValidPymtAccId) {
        invalidFields.push({ path: ExpenseResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_VALUE });
      }
    }
  }
};

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
