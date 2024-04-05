import { JSONObject } from "../apigateway";

export interface AuditDetailsType extends JSONObject {
  createdOn: string | Date;
  updatedOn: string | Date;
  createdBy: string;
  updatedBy: string;
}
