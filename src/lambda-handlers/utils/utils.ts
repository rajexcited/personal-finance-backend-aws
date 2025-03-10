import { AuthorizeUser, DbUserDetails, getUserDetailsById } from "../user";
import { AuditDetailsType } from "./audit-details-type";
import { getLogger } from "./logger";
import * as validations from "./validations";
import { formatTimestamp } from "./date-util";
import { AuthRole } from "../common";
import { InvalidError } from "../apigateway";

const _logger = getLogger("utils");

//todo the userid in auditdetail, could be current user or another. retrieve the another user using id to convert audit details appropritely in both parse or update auditDetails methods.

/**
 * Updates Audit details to save to DB with userDetails
 *
 * @param auditDetails assuming the audit details are retrieved from api
 * @param userDetails the user details are used for audit detail update
 */
const updateAuditDetails = (auditDetails: AuditDetailsType | null | undefined, userId: string) => {
  const logger = getLogger("updateAuditDetails", _logger);
  if (!validations.isValidUuid(userId)) {
    return null;
  }
  logger.debug("auditDetails", auditDetails, "userId", userId);
  const newAuditDetails: AuditDetailsType = { createdBy: "", createdOn: "", updatedBy: "", updatedOn: "" };

  if (validations.isValidUuid(auditDetails?.createdBy)) {
    newAuditDetails.createdBy = auditDetails?.createdBy as string;
  } else {
    newAuditDetails.createdBy = userId;
  }
  newAuditDetails.updatedBy = userId;

  // There is no else/otherwise block. as assumes that createdOn field is appropriate format for DB
  if (!validations.isValidDate(auditDetails?.createdOn, logger)) {
    // the createdOn field may not be avaialble (first time scenario)
    // the createdOn field may not be correct format (some conversion error)
    newAuditDetails.createdOn = formatTimestamp(new Date());
  } else if (auditDetails?.createdOn instanceof Date) {
    newAuditDetails.createdOn = formatTimestamp(auditDetails.createdOn);
  } else {
    newAuditDetails.createdOn = auditDetails?.createdOn as string;
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
export const parseAuditDetails = async (auditDetails: AuditDetailsType, userIdOrDetails: string | DbUserDetails, authUser: AuthorizeUser) => {
  const logger = getLogger("parseAuditDetails", _logger);
  logger.info("params", "auditDetails", auditDetails, "userIdOrDetails", userIdOrDetails, ", authUser", authUser);

  const fullName = (details: DbUserDetails | null) => (details ? `${details.lastName}, ${details.firstName}` : "unknown");

  const newAuditDetails: AuditDetailsType = { ...auditDetails };
  if (authUser?.role === AuthRole.PRIMARY) {
    newAuditDetails.createdBy = undefined;
    newAuditDetails.updatedBy = undefined;
  }

  if (authUser?.role === AuthRole.ADMIN) {
    const userDetails = await getValidatedUserDetails(userIdOrDetails);
    logger.info("userDetails", userDetails);

    if (!auditDetails.createdBy || (validations.isValidUuid(auditDetails.createdBy) && auditDetails.createdBy === userDetails?.id)) {
      newAuditDetails.createdBy = fullName(userDetails);
    } else if (validations.isValidUuid(auditDetails.createdBy) && auditDetails.createdBy !== userDetails?.id) {
      const createdByUserDetails = await getValidatedUserDetails(userIdOrDetails);
      newAuditDetails.createdBy = fullName(createdByUserDetails);
    }

    if (!auditDetails.updatedBy || (validations.isValidUuid(auditDetails.updatedBy) && auditDetails.updatedBy === userDetails?.id)) {
      newAuditDetails.updatedBy = fullName(userDetails);
    } else if (validations.isValidUuid(auditDetails.updatedBy) && auditDetails.updatedBy !== userDetails?.id) {
      const updatedByUserDetails = await getValidatedUserDetails(userIdOrDetails);
      newAuditDetails.updatedBy = fullName(updatedByUserDetails);
    }
  }

  if (!validations.isValidDate(auditDetails.createdOn, logger)) {
    newAuditDetails.createdOn = formatTimestamp(new Date());
  } else if (auditDetails.createdOn instanceof Date) {
    newAuditDetails.createdOn = formatTimestamp(auditDetails.createdOn);
  }

  if (!validations.isValidDate(auditDetails.updatedOn, logger)) {
    newAuditDetails.updatedOn = formatTimestamp(new Date());
  } else if (auditDetails.updatedOn instanceof Date) {
    newAuditDetails.updatedOn = formatTimestamp(auditDetails.updatedOn);
  }
  logger.info("newAuditDetails", newAuditDetails);

  return newAuditDetails;
};

/**
 * If valid userId is given, query table and returns the details
 * If valid userDetails is given, returns the same details
 *
 * @param userIdOrDetails userId or userDetails
 * @returns user db details if valid param otherwise null
 */
const getValidatedUserDetails = async (userIdOrDetails: string | DbUserDetails | null | undefined) => {
  if (!userIdOrDetails) {
    return null;
  }
  let details: DbUserDetails | null = null;
  const userId = typeof userIdOrDetails === "string" ? userIdOrDetails : userIdOrDetails.id;
  if (validations.isValidUuid(userId)) {
    if (typeof userIdOrDetails === "object") {
      details = userIdOrDetails;
    } else {
      details = await getUserDetailsById(userId);
    }
  }
  if (!details || !validations.isValidUuid(details.id) || !details.firstName || !details.lastName) {
    return null;
  }
  return details;
};

export const getJsonObj = <TResult>(jsonstr: string | null | undefined) => {
  const logger = getLogger("getJsonObj", _logger);
  try {
    if (jsonstr) {
      const parsed = JSON.parse(jsonstr);
      if (!parsed) throw Error("incorrect json structure");
      return parsed as TResult;
    }
  } catch (err) {
    logger.info("error parsing JSON string", err);
  }
  return null;
};

export const updateAuditDetailsFailIfNotExists = (auditDetails: AuditDetailsType | null | undefined, authUser: AuthorizeUser) => {
  const dbAuditDetails = updateAuditDetails(auditDetails, authUser.userId);
  if (!dbAuditDetails) {
    throw new InvalidError("auditDetails is null");
  }
  return dbAuditDetails;
};
