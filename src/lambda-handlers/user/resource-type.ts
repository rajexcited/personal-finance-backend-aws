import { AuditDetailsType } from "../utils";
import { AuthRole } from "../common";

export interface DbItemUser {
  PK: string;
  E_GSI_PK: string;
  /** ttl value in seconds */
  ExpiresAt?: number;
  details: DbUserDetails;
}
export interface DbItemToken {
  PK: string;
  E_GSI_PK: string;
  /** ttl value in seconds */
  ExpiresAt: number;
  details: DbUserTokenDetails;
}

export interface DbUserTokenDetails {
  sessionId: string;
  userId: string;
  userRole: AuthRole;
  /** date time in millis */
  tokenExpiresAt: number;
  // date time in millis
  initializedAt: number;
  platform: string;
  browser: string;
  browserVersion: string;
  userAgent: string;
  deviceType: string;
  activeAddress: {
    city: string;
    state: string;
    country: string;
  };
}

export enum DbUserStatus {
  ACTIVE_USER = "active",
  INACTIVE_USER = "inactive",
  DELETE_USER = "deleted"
}

export interface DbUserDetails {
  id: string;
  firstName: string;
  lastName: string;
  emailId: string;
  auditDetails: AuditDetailsType;
  phash: string;
  status: DbUserStatus;
}

export enum ApiUserAccountStatus {
  ACTIVE_USER = "active-user",
  DELETED_USER = "deleted-user",
  DEACTIVATED_USER = "deactive-user"
}

export interface ApiUserResource {
  firstName?: string;
  lastName?: string;
  emailId?: string;
  password?: string;
  newPassword?: string;
  countryCode?: string;
  status: ApiUserAccountStatus;
}

export class AuthorizeUser {
  userId: string;
  role: AuthRole;
}
