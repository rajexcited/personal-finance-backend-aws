import { AuditDetailsType } from "./audit-details-type";

export const compareUpdatedOn = (item1AuditDetails?: AuditDetailsType, item2AuditDetails?: AuditDetailsType) => {
  const updatedOn1 = item1AuditDetails?.updatedOn as string;
  const updatedOn2 = item2AuditDetails?.updatedOn as string;
  const updatedOnCompareResult = updatedOn1.localeCompare(updatedOn2);
  return updatedOnCompareResult;
};

export const compareCreatedOn = (item1AuditDetails?: AuditDetailsType, item2AuditDetails?: AuditDetailsType) => {
  const createdOn1 = item1AuditDetails?.createdOn as string;
  const createdOn2 = item2AuditDetails?.createdOn as string;
  const createdOnCompareResult = createdOn1.localeCompare(createdOn2);
  return createdOnCompareResult;
};
