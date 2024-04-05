import { AuditDetailsType } from "../utils";

export interface DbPymtAccItem {
  PK: string;
  UP_GSI_PK: string;
  details: DbPaymentAccountDetails;
}

export interface DbPaymentAccountDetails {
  id: string;
  shortName: string;
  accountName: string;
  accountNumber?: string;
  paymentAccountType: string;
  tags: string[];
  institutionName: string;
  description: string;
  auditDetails: AuditDetailsType;
}

export interface DefaultPaymentAccounts {
  shortName: string;
  accountName: string;
  paymentAccountType: string;
  tags: string[];
  description: string;
  institutionName: string;
}
