import { ConfigStatus } from "../config-type";
import { ExpenseBelongsTo } from "../expenses/base-config";
import { PymtAccStatus } from "../pymt-acc/base-config";
import { AuditDetailsType } from "../utils";

export interface ApiMonthlyStatResource {
  total: string;
  count: number;
  monthNo: number;
  monthName: string;
}

export interface ApiResourceStatisticsBase {
  total: string;
  monthlyTotal: ApiMonthlyStatResource[];
  description: string;
  count: number;
}

export interface ApiResourceStatisticsConfigType extends ApiResourceStatisticsBase {
  id: string;
  name: string;
  value: string;
  status: ConfigStatus;
}

export interface ApiResourceStatisticsTag extends ApiResourceStatisticsBase {
  tag: string;
}

export interface ApiResourceStatisticsPymtAcc extends ApiResourceStatisticsBase {
  id: string;
  shortName: string;
  status: PymtAccStatus;
}

export enum StatBelongsTo {
  Purchase = "stats-purchase",
  Refund = "stats-refund",
  Income = "stats-income",
  PymtAcc = "stats-pymt-acc",
}

export interface ApiStatsResourceExpense {
  year: number;
  belongsTo: StatBelongsTo;
  details: ApiResourceStatisticsBase;
  byType: ApiResourceStatisticsConfigType[];
  byTags: ApiResourceStatisticsTag[];
  byTypeTags: ApiResourceStatisticsTag[];
  byPersonTags: ApiResourceStatisticsConfigType[];
  byPymtAcc: ApiResourceStatisticsPymtAcc[];
  auditDetails: AuditDetailsType;
}
