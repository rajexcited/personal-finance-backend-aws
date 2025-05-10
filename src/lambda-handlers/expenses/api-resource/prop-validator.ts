import { InvalidField } from "../../apigateway";
import { LoggerBase, validations } from "../../utils";
import { ErrorMessage, ExpenseRequestResourcePath } from "../api-resource";

export const BILLNAME_MAX_LENGTH = 50;
export const NAME_MIN_LENGTH = 2;

const AMOUNT_MIN = -10000000;
const AMOUNT_MAX = 10000000;

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

export const validateTags = (tags: string[] | undefined | null, invalidFields: InvalidField[], logger: LoggerBase) => {
  if (!tags) {
    invalidFields.push({ path: ExpenseRequestResourcePath.TAGS, message: ErrorMessage.MISSING_VALUE });
  } else if (!Array.isArray(tags)) {
    invalidFields.push({ path: ExpenseRequestResourcePath.TAGS, message: ErrorMessage.INCORRECT_FORMAT });
  } else if (tags.length > validations.DEFAULT_MAX_ALLOWED_TAGS) {
    invalidFields.push({ path: ExpenseRequestResourcePath.TAGS, message: ErrorMessage.LIMIT_EXCEEDED });
  } else {
    const inValidTags = tags.filter((tag) => !validations.isValidTag(tag));
    if (inValidTags.length > 0) {
      logger.info("inValidTags =", inValidTags);
      invalidFields.push({ path: ExpenseRequestResourcePath.TAGS, message: "invalid tags [" + inValidTags + "]" });
    }
  }
};

export const isValidDescription = validations.isValidDescription;

export const isValidExpenseId = validations.isValidUuid;

export const isValidExpenseDate = validations.isValidDate;
export const isValidVerifiedTimestamp = validations.isValidDate;

export const areTagsValid = validations.areTagsValid;
