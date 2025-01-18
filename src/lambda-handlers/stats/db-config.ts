import { getDefaultCurrencyProfile } from "../config-type";
import { _configTypeTableName, getDetailsTablePk as getConfigTypeDetailsTablePk } from "../config-type/base-config";
import { DbConfigTypeDetails } from "../config-type/resource-type";
import { ExpenseBelongsTo, ExpenseStatus } from "../expenses/base-config";
import {
  DbItemExpense,
  ExpenseTableName,
  getGsiAttrDetailsBelongsTo,
  getGsiPkDetails,
  getGsiSkDetailsExpenseDate,
  UserIdStatusIndex,
} from "../expenses/db-config";
import { DbDetailsIncome } from "../expenses/income";
import { DbDetailsPurchase } from "../expenses/purchase";
import { DbDetailsRefund } from "../expenses/refund";
import { _pymtAccTableName, getDetailsTablePk as getPymtAccDetailsPk } from "../pymt-acc/base-config";
import { DbPaymentAccountDetails } from "../pymt-acc/resource-type";
import { dateutil, dbutil, getLogger, LoggerBase } from "../utils";

export const purchaseProjectedExpression =
  "details.amount,details.purchaseTypeId,details.tags,details.personIds,details.purchaseDate,details.belongsTo,details.paymentAccountId";
export type DbItemProjectedPurchase = Record<
  "details",
  Pick<DbDetailsPurchase, "amount" | "purchaseTypeId" | "tags" | "personIds" | "purchaseDate" | "belongsTo" | "paymentAccountId">
>;

export const incomeProjectedExpression =
  "details.amount,details.incomeTypeId,details.tags,details.personIds,details.incomeDate,details.belongsTo,details.paymentAccountId";
export type DbItemProjectedIncome = Record<
  "details",
  Pick<DbDetailsIncome, "amount" | "incomeTypeId" | "tags" | "personIds" | "incomeDate" | "belongsTo" | "paymentAccountId">
>;

export const refundProjectedExpression =
  "details.amount,details.reasonId,details.tags,details.personIds,details.refundDate,details.belongsTo,details.paymentAccountId";
export type DbItemProjectedRefund = Record<
  "details",
  Pick<DbDetailsRefund, "amount" | "reasonId" | "tags" | "personIds" | "refundDate" | "belongsTo" | "paymentAccountId">
>;

const configTypeProjectionExpression = "details.tags,details.id,details.name,details.value,details.status";
export type DbItemProjectedConfigType = Record<"details", Pick<DbConfigTypeDetails, "tags" | "id" | "name" | "value" | "status">>;

const pymtAccProjectionExpression = "details.id,details.shortName,details.status";
export type DbItemProjectedPymtAcc = Record<"details", Pick<DbPaymentAccountDetails, "id" | "shortName" | "status">>;

export const getListOfPK = async (userId: string, year: number, belongsTo: ExpenseBelongsTo, _logger: LoggerBase) => {
  const logger = getLogger("getListOfPK", _logger);

  const currencyProfile = await getDefaultCurrencyProfile(userId, logger);

  const searchStartDate = dateutil.parseTimestamp("01-01-" + year, "MM-DD-YYYY", logger);
  const searchEndDate = dateutil.parseTimestamp("01-01-" + (year + 1), "MM-DD-YYYY", logger);

  const items = await dbutil.queryAll<DbItemExpense<null>>(logger, {
    TableName: ExpenseTableName,
    IndexName: UserIdStatusIndex,
    KeyConditionExpression: "US_GSI_PK = :gpkv and US_GSI_SK BETWEEN :gskv1 and :gskv2",
    FilterExpression: "US_GSI_BELONGSTO = :gbtv",
    ExpressionAttributeValues: {
      ":gpkv": getGsiPkDetails(userId, ExpenseStatus.ENABLE, currencyProfile, logger),
      ":gskv1": getGsiSkDetailsExpenseDate(searchStartDate, logger),
      ":gskv2": getGsiSkDetailsExpenseDate(searchEndDate, logger),
      ":gbtv": getGsiAttrDetailsBelongsTo(belongsTo, logger),
    },
  });

  logger.info("retrieved", items.length, " searchStartDate =", searchStartDate, " searchEndDate =", searchEndDate, " belongsTo =", belongsTo);

  return items.map((xpnsItm) => xpnsItm.PK);
};

export const getConfigTypeList = async (nullableConfIdList: Array<NonNullable<string>>, _logger: LoggerBase) => {
  const logger = getLogger("getConfigTypeList", _logger);
  const NonNullableUniqueConfIdList = [...new Set(nullableConfIdList)];
  const detailsItemKeys = NonNullableUniqueConfIdList.map((pk) => ({ PK: getConfigTypeDetailsTablePk(pk) }));

  const reqAttrs = { ProjectionExpression: configTypeProjectionExpression };
  const detailsItemList = await dbutil.batchGet<DbItemProjectedConfigType>(detailsItemKeys, _configTypeTableName, reqAttrs, logger);
  logger.debug("retrieved partial projected attribute details");

  return detailsItemList;
};

export const getPymtAccList = async (nullablePymtAccIdList: Array<string | undefined>, _logger: LoggerBase) => {
  const logger = getLogger("getPymtAccList", _logger);

  const nonNullablePymtAccIdList: NonNullable<string>[] = nullablePymtAccIdList.filter((id) => id !== undefined).map((id) => id as string);
  const nonNullableUniquePymtAccIdList = [...new Set(nonNullablePymtAccIdList)];
  const detailsItemKeys = [...nonNullableUniquePymtAccIdList].map((pk) => ({ PK: getPymtAccDetailsPk(pk) }));

  const reqAttrs = { ProjectionExpression: pymtAccProjectionExpression };
  const detailsItemList = await dbutil.batchGet<DbItemProjectedPymtAcc>(detailsItemKeys, _pymtAccTableName, reqAttrs, logger);
  logger.debug("retrieved partial projected attribute details");

  return detailsItemList;
};
