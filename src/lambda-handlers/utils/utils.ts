import { TranslateConfig } from "@aws-sdk/lib-dynamodb";
import * as dateutil from "date-and-time";
import { DbUserDetails } from "../user";
import { AuditDetailsType } from "./audit-details-type";
import { getLogger } from "./logger";
import * as validations from "./validations";

export const DdbTranslateConfig: TranslateConfig = {
  marshallOptions: {
    convertClassInstanceToMap: true,
    convertEmptyValues: false,
    convertTopLevelContainer: true,
    removeUndefinedValues: true,
  },
};

const _logger = getLogger("utils");

//todo the userid in auditdetail, could be current user or another. retrieve the another user using id to convert audit details appropritely in both parse or update auditDetails methods.

/**
 * Updates Audit details to save to DB with userDetails
 *
 * @param auditDetails assuming the audit details are retrieved from api
 * @param userDetails the user details are used for audit detail update
 */
export const updateAuditDetails = (auditDetails: AuditDetailsType, userDetails: DbUserDetails) => {
  const logger = getLogger("updateAuditDetails", _logger);
  if (!userDetails.id || !validations.isValidUuid(userDetails.id)) {
    return null;
  }
  logger.info("auditDetails", auditDetails, "userDetails", userDetails);
  const newAuditDetails: AuditDetailsType = { createdBy: "", createdOn: "", updatedBy: "", updatedOn: "" };

  if (!auditDetails.createdBy || !validations.isValidUuid(auditDetails.createdBy)) {
    // this ensures the details coming from rest api
    newAuditDetails.createdBy = userDetails.id;
  }
  newAuditDetails.updatedBy = userDetails.id;

  // There is no else/otherwise block. as assumes that createdOn field is appropriate format for DB
  if (!validations.isValidDate(auditDetails.createdOn)) {
    // the createdOn field may not be avaialble (first time scenario)
    // the createdOn field may not be correct format (some conversion error)
    newAuditDetails.createdOn = formatTimestamp(new Date());
  } else if (typeof auditDetails.createdOn === "object") {
    newAuditDetails.createdOn = formatTimestamp(auditDetails.createdOn as Date);
  }

  newAuditDetails.updatedOn = formatTimestamp(new Date());
  logger.info("newAuditDetails", newAuditDetails);
  return newAuditDetails;
};

/**
 * Parsing audit details retrieved from db and convert details for rest api
 *
 * @param auditDetails assuming the audit details are retrieved from DB
 * @param userDetails the user details are used for audit detail update
 * @returns
 */
export const parseAuditDetails = (auditDetails: AuditDetailsType, userDetails: DbUserDetails) => {
  if (!userDetails.id || !validations.isValidUuid(userDetails.id) || !userDetails.firstName || !userDetails.lastName) {
    return null;
  }
  const name = `${userDetails.lastName}, ${userDetails.firstName}`;
  const createdBy = auditDetails.createdBy === userDetails.id ? name : null;
  const updatedBy = auditDetails.updatedBy === userDetails.id ? name : null;
  const createdOn = parseTimestamp(auditDetails.createdOn as string);

  const newAuditDetails: AuditDetailsType = {
    createdBy: createdBy || (validations.isValidUuid(auditDetails.createdBy) ? "" : auditDetails.createdBy),
    updatedBy: updatedBy || (validations.isValidUuid(auditDetails.updatedBy) ? "" : auditDetails.updatedBy),
    createdOn: createdOn || new Date(),
    updatedOn: parseTimestamp(auditDetails.updatedOn as string),
  };
  return newAuditDetails;
};

const DEFAULT_FORMAT_PATTERN = "MMDDYYYY HH:mm:ss.SSS Z";
export const parseTimestamp = (timestampStr: string, formatPattern?: string): Date => {
  const format = formatPattern || DEFAULT_FORMAT_PATTERN;
  return dateutil.parse(timestampStr, format);
};

export const formatTimestamp = (timestamp: Date, formatPattern?: string): string => {
  const format = formatPattern || DEFAULT_FORMAT_PATTERN;
  return dateutil.format(timestamp, format);
};

export const getJsonObj = <TResult>(jsonstr: string) => {
  const logger = getLogger("getJsonObj", _logger);
  try {
    const parsed = JSON.parse(jsonstr);
    if (!parsed) throw Error("incorrect json structure");
    return parsed as TResult;
  } catch (err) {
    logger.info("error parsing JSON string", err);
  }
  return null;
};

export const getEpochSeconds = (ttl: Date) => {
  const millis = ttl.getTime();
  const seconds = millis / 1000;
  return Math.floor(seconds);
};
