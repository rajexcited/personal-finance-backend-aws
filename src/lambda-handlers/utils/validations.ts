import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { parseTimestamp } from "./utils";
import { getLogger } from "./logger";

const _logger = getLogger("validations");

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
  logger.info("param date", date, "param dateFormat", dateFormat);
  if (typeof date === "string") {
    dupdate = parseTimestamp(date);
  } else if (typeof date === "number") {
    dupdate = new Date(date);
  } else {
    dupdate = new Date(date || NaN);
  }
  const invalidDate = new Date(NaN);
  logger.info("dupdate", dupdate, "invalidDate", invalidDate, "(String(dupdate) === String(invalidDate))?", String(dupdate) === String(invalidDate));
  return date && dupdate && String(dupdate) === String(invalidDate);
};

export const isValidPassword = (password: string | undefined | null) => {
  if (!password) return false;
  const passwordRegex = /^(?=.*[\d])(?=.*[A-Z])(?=.*[!@#$%^&*])[\w!@#$%^&\(\)\=*]{8,25}$/;
  return passwordRegex.test(password);
};

export const isValidName = (name: string | undefined | null) => {
  if (!name) return false;
  const nameRegex = /^[\w\s]+$/;
  return nameRegex.test(name);
};

export const isValidEmail = (emailId: string | undefined | null) => {
  if (!emailId) return false;
  const emailIdRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return emailIdRegex.test(emailId);
};
