import { AuditDetailsType } from "../utils";
import { PymtAccStatus } from "./base-config";

export interface DbItemPymtAcc {
  PK: string;
  UP_GSI_PK: string;
  UP_GSI_SK: string;
  details: DbPaymentAccountDetails;
}

export interface DbPaymentAccountDetails {
  id: string;
  shortName: string;
  accountIdNum: string;
  institutionName: string;
  typeId: string;
  description: string;
  status: PymtAccStatus;
  tags: string[];
  auditDetails: AuditDetailsType;
  profileId: string;
}

export interface DefaultPaymentAccounts {
  shortName: string;
  accountIdNum: string;
  typeName: string;
  tags: string[];
  description: string;
  institutionName: string;
  status?: PymtAccStatus;
}

export interface ApiPaymentAccountResource {
  id?: string;
  shortName: string;
  accountIdNum?: string;
  institutionName?: string;
  typeId: string;
  description: string;
  status: PymtAccStatus;
  tags: string[];
  auditDetails: AuditDetailsType;
  currencyProfileId: string;
}
