import { AuditDetailsType } from "../utils";
import { JSONObject } from "../apigateway";

export enum Status {
  ENABLE = "enable",
  DISABLE = "disable",
  DELETED = "deleted",
}

export enum BelongsTo {
  ExpenseCategory = "expense-category",
  PaymentAccountType = "pymt-account-type",
  CurrencyProfile = "currency-profile",
}

export interface DbConfigTypeItem {
  PK: string;
  UB_GSI_PK: string;
  UB_GSI_SK: string;
  details: DbConfigTypeDetails;
}

export interface DbConfigTypeDetails extends JSONObject {
  id: string;
  belongsTo: BelongsTo;
  name: string;
  value: string;
  description: string;
  status: Status;
  color?: string;
  tags: string[];
  auditDetails: AuditDetailsType;
}

export interface ApiConfigTypeResource extends JSONObject {
  id: string;
  belongsTo: BelongsTo;
  name: string;
  value: string;
  description: string;
  status: Status;
  color?: string;
  tags: string[];
  auditDetails: AuditDetailsType;
}

export interface DefaultConfigData {
  name: string;
  value: string;
  tags: string[];
  description: string;
}

export interface CurrencyProfileConfigData {
  id: string;
  country: string;
  currency: {
    name: string;
    symbol: string;
  };
  description: string;
}
