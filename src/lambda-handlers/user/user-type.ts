import { AuditDetailsType } from "../utils";

export interface DbUserDetailItem {
  PK: string;
  E_GSI_PK: string;
  details: DbUserDetails;
}
export interface DbUserTokenItem {
  PK: string;
  tokenExpiresAt: number;
  ExpiresAt: number;
}

export interface DbUserDetails {
  id: string;
  firstName: string;
  lastName: string;
  emailId: string;
  auditDetails: AuditDetailsType;
  phash: string;
}

export interface ApiUserResource {
  firstName?: string;
  lastName?: string;
  emailId?: string;
  password?: string;
  newPassword?: string;
}
