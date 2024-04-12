import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { parseTimestamp } from "./utils";
import { getLogger } from "./logger";

const _logger = getLogger("validations");
const DEFAULT_NAME_MAX_LENGTH = 25;
const DEFAULT_NAME_MIN_LENGTH = 2;

const DEFAULT_EMAILID_MAX_LENGTH = 50;
const DEFAULT_EMAILID_MIN_LENGTH = 8;

const DEFAULT_PASSWORD_MAX_LENGTH = 25;
const DEFAULT_PASSWORD_MIN_LENGTH = 8;

const DEFAULT_DESCRIPTION_MAX_LENGTH = 150;
const DEFAULT_DESCRIPTION_MIN_LENGTH = 2;

const DEFAULT_TAG_MAX_LENGTH = 15;
const DEFAULT_TAG_MIN_LENGTH = 3;

const DEFAULT_COLOR_MAX_LENGTH = 7;
const DEFAULT_COLOR_MIN_LENGTH = 4;

const DEFAULT_MAX_ALLOWED_TAGS = 10;

export const isValidUuid = (id?: string) => {
  return id && uuidValidate(id) && uuidVersion(id) === 4;
};

/**
 *
 * @param date
 * @param dateFormat if not provided default format pattern will be used to parsed date string
 * @returns true if valid date
 */
export const isValidDate = (date?: Date | string | number | null, dateFormat?: string) => {
  const logger = getLogger("isValidDate", _logger);
  let dupdate: Date;
  logger.info("param date =", date, ", param dateFormat =", dateFormat);
  if (typeof date === "string") {
    dupdate = parseTimestamp(date);
  } else if (typeof date === "number") {
    dupdate = new Date(date);
  } else {
    dupdate = new Date(date || NaN);
  }
  const invalidDate = new Date(NaN);
  logger.debug(
    "dupdate =",
    dupdate,
    ", invalidDate =",
    String(invalidDate),
    ", (String(dupdate) === String(invalidDate)) ?",
    String(dupdate) === String(invalidDate)
  );
  return date && String(dupdate) !== String(invalidDate);
};

export const isValidPassword = (password: string | undefined | null) => {
  const validLength = isValidLength(password, DEFAULT_PASSWORD_MIN_LENGTH, DEFAULT_PASSWORD_MAX_LENGTH);
  if (!validLength) return false;

  const passwordRegex = /^(?=.*[\d])(?=.*[A-Z])(?=.*[!@#$%^&*])[\w!@#$%^&\(\)\=*]{8,25}$/;
  return passwordRegex.test(password as string);
};

export const isValidName = (name: string | undefined | null, maxLength?: number, minLength?: number) => {
  maxLength = maxLength === undefined ? DEFAULT_NAME_MAX_LENGTH : maxLength;
  minLength = minLength === undefined ? DEFAULT_NAME_MIN_LENGTH : minLength;
  const validLength = isValidLength(name, minLength, maxLength);
  if (!validLength) return false;

  const nameRegex = /^[\w\s\.,<>\?'";:\{\}\[\]|`~!@#\$%\^&\*\(\)\+=-]+$/;
  return nameRegex.test(name as string);
};

export const isValidEmail = (emailId: string | undefined | null) => {
  const validLength = isValidLength(emailId, DEFAULT_EMAILID_MIN_LENGTH, DEFAULT_EMAILID_MAX_LENGTH);
  if (!validLength) return false;

  const emailIdRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return emailIdRegex.test(emailId as string);
};

export const isValidDescription = (description: string | undefined | null, maxLength?: number) => {
  maxLength = maxLength === undefined ? DEFAULT_DESCRIPTION_MAX_LENGTH : maxLength;
  const validLength = isValidLength(description, DEFAULT_DESCRIPTION_MIN_LENGTH, maxLength);
  if (!validLength) return false;

  const descriptionRegex = /^[\w\s\.,<>\?\/'";:\{\}\[\]|\\`~!@#\$%\^&\*\(\)\+=-\Sc]+$/;
  return descriptionRegex.test(description as string);
};

export const areTagsValid = (tags: string[] | undefined | null, maxAllowed?: number) => {
  if (!tags) return false;

  maxAllowed = maxAllowed === undefined ? DEFAULT_MAX_ALLOWED_TAGS : maxAllowed;
  if (tags.length > maxAllowed) return false;

  const validTags = tags.filter(isValidTag);
  return validTags.length === tags.length;
};

export const isValidTag = (tag: string | undefined | null) => {
  const validLength = isValidLength(tag, DEFAULT_TAG_MIN_LENGTH, DEFAULT_TAG_MAX_LENGTH);
  if (!validLength) return false;

  const tagRegex = /^[\w\.-]+$/;
  return tagRegex.test(tag as string);
};

export const isValidColor = (color: string | undefined | null) => {
  const validLength = isValidLength(color, DEFAULT_COLOR_MIN_LENGTH, DEFAULT_COLOR_MAX_LENGTH);
  if (!validLength) return false;

  const colorRegex = /^#[a-zA-Z0-9]+$/;
  return colorRegex.test(color as string);
};

export const isValidLength = (text: string | null | undefined, minLength: number, maxLength: number) => {
  if (text === null || text === undefined) return false;
  if (text.length < minLength) return false;
  if (text.length > maxLength) return false;
  return true;
};
