import * as datetime from "date-and-time";
import { LoggerBase, getLogger } from "./logger";
import { _logger } from "./base-config";

const __logger = getLogger("dateutil", _logger);

export const addMonths = datetime.addMonths;
export const addSeconds = datetime.addSeconds;

const DEFAULT_FORMAT_PATTERN = "MM-DD-YYYY HH:mm:ss.SSS Z";
export const parseTimestamp = (timestampStr: string, formatPattern?: string | null, baseLogger?: LoggerBase | null): Date => {
  const logger = getLogger("parseTimestamp", __logger, baseLogger);
  const format = formatPattern || DEFAULT_FORMAT_PATTERN;

  logger.debug("timestampStr =", timestampStr, ", formatPattern =", format);
  return datetime.parse(timestampStr, format);
};

export const formatTimestamp = (timestamp: Date, formatPattern?: string | null, baseLogger?: LoggerBase | null): string => {
  const logger = getLogger("formatTimestamp", __logger, baseLogger);
  const format = formatPattern || DEFAULT_FORMAT_PATTERN;

  logger.debug("timestamp =", timestamp, ", formatPattern =", format);
  return datetime.format(timestamp, format);
};

export const getMonthStartDate = (timestamp: Date | string | null | undefined, formatPattern?: string | null, baseLogger?: LoggerBase | null) => {
  const logger = getLogger("getMonthStartDate", __logger, baseLogger);
  const format = formatPattern || DEFAULT_FORMAT_PATTERN;

  if (!timestamp) return null;
  logger.debug("timestamp =", timestamp, ", formatPattern =", format);
  const date = typeof timestamp === "string" ? datetime.parse(timestamp, format) : timestamp;

  const monthStartDate = new Date(date.getTime());
  monthStartDate.setHours(0, 0, 0, 0);
  monthStartDate.setDate(1);

  logger.debug("monthStartDate =", monthStartDate);
  return monthStartDate;
};

export const getMonthEndDate = (timestamp: Date | string | null | undefined, formatPattern?: string | null, baseLogger?: LoggerBase | null) => {
  const logger = getLogger("getMonthEndDate", __logger, baseLogger);
  const format = formatPattern || DEFAULT_FORMAT_PATTERN;

  if (!timestamp) return null;
  logger.debug("timestamp =", timestamp, ", formatPattern =", format);
  const date = typeof timestamp === "string" ? datetime.parse(timestamp, format) : timestamp;

  const monthEndDate = new Date(date.getTime());
  monthEndDate.setHours(0, 0, 0, 0);
  monthEndDate.setDate(1);
  monthEndDate.setMonth(monthEndDate.getMonth() + 1);
  monthEndDate.setMilliseconds(-1);

  logger.debug("monthEndDate =", monthEndDate);
  return monthEndDate;
};
