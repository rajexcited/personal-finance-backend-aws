import { AuditDetailsType } from "../utils";

export interface DbUserDetailItem {
  PK: string;
  E_GSI_PK: string;
  details: DbUserDetails;
}
export interface DbUserTokenItem {
  PK: string;
  // ttl value in seconds
  ExpiresAt: number;
  details: DbUserTokenDetails;
}

export interface DbUserTokenDetails {
  // date time in millis
  tokenExpiresAt: number;
  // date time in millis
  iat: number;
}

export interface DbUserDetails {
  id: string;
  firstName: string;
  lastName: string;
  emailId: string;
  auditDetails: AuditDetailsType;
  phash: string;
  status: "active" | "inactive" | "deleted";
}

export interface ApiUserResource {
  firstName?: string;
  lastName?: string;
  emailId?: string;
  password?: string;
  newPassword?: string;
  countryCode?: string;
}
