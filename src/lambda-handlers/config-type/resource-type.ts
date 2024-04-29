import { AuditDetailsType } from "../utils";
import { BelongsTo, ConfigStatus } from "./base-config";

export interface DbItemConfigType {
  PK: string;
  UB_GSI_PK: string;
  UB_GSI_SK: string;
  details: DbConfigTypeDetails;
}

export interface DbConfigTypeDetails {
  id: string;
  belongsTo: BelongsTo;
  name: string;
  value: string;
  description?: string;
  status: ConfigStatus;
  color?: string;
  tags: string[];
  auditDetails: AuditDetailsType;
}

export interface ApiConfigTypeResource {
  id?: string;
  belongsTo?: BelongsTo;
  name: string;
  status: ConfigStatus;
  description?: string;
  tags: string[];
  auditDetails?: AuditDetailsType;
  value: string;
  color?: string;
}

export interface ApiCurrencyProfileResource extends ApiConfigTypeResource {
  country: {
    name: string;
    code: string;
  };
  currency: {
    name: string;
    code: string;
    symbol: string;
  };
}
