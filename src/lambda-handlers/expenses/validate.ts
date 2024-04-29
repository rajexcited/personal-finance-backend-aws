import { InvalidField } from "../apigateway";
import { isValidExpenseCategoryId } from "../config-type";
import { isValidPaymentAccount } from "../pymt-acc";
import { LoggerBase, getLogger, validations } from "../utils";
import { ErrorMessage, ExpenseResourcePath, GSI_ATTR_DATE_FORMAT, ReceiptType, _expenseTableName, _logger } from "./base-config";
import { isValidPathKey } from "./receipts";
import { ApiExpenseItemResource, ApiExpenseResource, DbReceiptDetails } from "./resource-type";

export const BILLNAME_MAX_LENGTH = 50;
export const NAME_MIN_LENGTH = 2;

const AMOUNT_MIN = -10000000;
const AMOUNT_MAX = 10000000;

const RECEIPTS_MAX_ALLOWED = 5;

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
  if (typeof purchaseDate === "string" && validations.isValidDate(purchaseDate, logger, GSI_ATTR_DATE_FORMAT)) {
    return true;
  }
  if (validations.isValidDate(purchaseDate, logger)) {
    return true;
  }
  return false;
};

export const isValidReceipts = (receipts: DbReceiptDetails[] | null | undefined, _logger: LoggerBase) => {
  const logger = getLogger("isValidReceipts", _logger);
  if (!receipts) return false;
  if (receipts.length > RECEIPTS_MAX_ALLOWED) return false;
  logger.debug("receipts array not empty");
  const invalidReceipts = receipts.filter((rct) => {
    if (!validations.isValidUuid(rct.id)) return true;
    if (rct.type !== ReceiptType.JPG && rct.type !== ReceiptType.PDF && rct.type !== ReceiptType.PNG) return true;
    if (!rct.path) return true;
    if (!rct.path.endsWith(rct.id)) return true;

    return false;
  });

  logger.debug("invalidReceipts.length=", invalidReceipts.length, ", invalidReceipts=", invalidReceipts);
  return invalidReceipts.length === 0;
};

export const areReceiptsExist = async (receipts: DbReceiptDetails[] | null | undefined, _logger: LoggerBase) => {
  const logger = getLogger("isReceiptExist", _logger);

  const receiptList = receipts || [];
  const existingReceiptsInStoragePromises = receiptList.map((rct) => isValidPathKey(rct.path, logger));
  const existingReceiptsInStorage = await Promise.all(existingReceiptsInStoragePromises);

  const invalidReceipts = existingReceiptsInStorage.filter((isValid) => !isValid);
  return invalidReceipts.length === 0;
};

export const validateExpenseItems = async (
  expenseItems: ApiExpenseItemResource[],
  invalidFields: InvalidField[],
  userId: string,
  _logger: LoggerBase
) => {
  const logger = getLogger("validateExpenseItems", _logger);
  const invalid: InvalidField[] = [];

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
    invalid.push({ path: ExpenseResourcePath.EXPENSE_ITEMS, message: ErrorMessage.INCORRECT_VALUE });
  }

  const validExpItmsCategoryPromises = expenseItems.map(async (ei) => {
    if (!ei.expenseCategoryId) {
      return true;
    }
    if (!validations.isValidUuid(ei.expenseCategoryId)) {
      return false;
    }
    const isValidExpnseCategory = await isValidExpenseCategoryId(ei.expenseCategoryId, userId, logger);
    return isValidExpnseCategory;
  });
  const validExpItmsCategories = await Promise.all(validExpItmsCategoryPromises);
  logger.info("validExpItmsCategories.length =", validExpItmsCategories.length, ", validExpItmsCategories =", validExpItmsCategories);

  const invalidExpItmsCategory = validExpItmsCategories.find((isValid) => !isValid);
  if (invalidExpItmsCategory !== undefined) {
    invalid.push({
      path: ExpenseResourcePath.EXPENSE_ITEMS + "." + ExpenseResourcePath.EXPENSE_CATEGORY,
      message: ErrorMessage.INCORRECT_VALUE,
    });
  }

  invalidFields.push(...invalid);
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
      invalidFields.push({ path: ExpenseResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_VALUE });
    } else {
      const isValidPymtAccId = await isValidPaymentAccount(req.paymentAccountId, userId, logger);
      if (!isValidPymtAccId) {
        invalidFields.push({ path: ExpenseResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_VALUE });
      }
    }
  }
};
