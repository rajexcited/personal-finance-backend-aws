import { _configTypeTableName } from "../config-type/base-config";
import { DbConfigTypeDetails, DbItemConfigType } from "../config-type/resource-type";
import { ExpenseBelongsTo, ExpenseStatus } from "../expenses/base-config";
import {
  DbItemExpense,
  ExpenseTableName,
  getGsiAttrDetailsBelongsTo,
  getGsiPkDetails,
  getGsiSkDetailsExpenseDate,
  UserIdStatusIndex,
} from "../expenses/db-config";
import { _pymtAccTableName } from "../pymt-acc/base-config";
import { DbItemPymtAcc, DbPaymentAccountDetails } from "../pymt-acc/resource-type";
import { dateutil, dbutil, getLogger, LoggerBase } from "../utils";

export const getListOfPK = async (userId: string, year: number, belongsTo: ExpenseBelongsTo, _logger: LoggerBase) => {
  const logger = getLogger("getListOfPK", _logger);

  const searchStartDate = dateutil.parseTimestamp("01-01-" + year, "MM-DD-YYYY", logger);
  const searchEndDate = dateutil.parseTimestamp("01-01-" + (year + 1), "MM-DD-YYYY", logger);

  const items = await dbutil.queryAll<DbItemExpense<null>>(logger, {
    TableName: ExpenseTableName,
    IndexName: UserIdStatusIndex,
    KeyConditionExpression: "US_GSI_PK = :gpkv and US_GSI_SK BETWEEN :gskv1 and :gskv2",
    FilterExpression: "US_GSI_BELONGSTO = :gbtv",
    ExpressionAttributeValues: {
      ":gpkv": getGsiPkDetails(userId, ExpenseStatus.ENABLE, logger),
      ":gskv1": getGsiSkDetailsExpenseDate(searchStartDate, logger),
      ":gskv2": getGsiSkDetailsExpenseDate(searchEndDate, logger),
      ":gbtv": getGsiAttrDetailsBelongsTo(belongsTo, logger),
    },
  });

  logger.info("retrieved", items.length, " searchStartDate =", searchStartDate, " searchEndDate =", searchEndDate, " belongsTo =", belongsTo);

  return items.map((xpnsItm) => xpnsItm.PK);
};

export type PartialConfigType = Pick<DbConfigTypeDetails, "id" | "tags" | "name" | "value" | "status">;
type NullableString = string | null;

export const getConfigTypeList = async (nullableConfIdList: NullableString[], _logger: LoggerBase) => {
  const logger = getLogger("getConfigTypeList", _logger);
  const NonNullableUniqueConfIdList = [...new Set(nullableConfIdList.filter((pk) => pk !== null))];
  const detailsItemKeys = NonNullableUniqueConfIdList.map((pk) => ({ PK: pk }));

  const reqAttrs: Record<"ProjectionExpression", string> = {
    ProjectionExpression: "details.tags,details.id,details.name,details.value,details.status",
  };
  const detailsItemList = await dbutil.batchGet<DbItemConfigType>(detailsItemKeys, _configTypeTableName, reqAttrs, logger);
  logger.debug("retrieved partial projected attribute details");

  const configTypeList: PartialConfigType[] = detailsItemList.map((dbItem) => ({
    id: dbItem.details.id,
    name: dbItem.details.name,
    value: dbItem.details.value,
    status: dbItem.details.status,
    tags: dbItem.details.tags,
  }));

  return configTypeList;
};

export type PartialPymtAcc = Pick<DbPaymentAccountDetails, "id" | "shortName" | "status">;
export const getPymtAccList = async (nullablePymtAccIdPKList: NullableString[], _logger: LoggerBase) => {
  const logger = getLogger("getPymtAccList", _logger);
  const NonNullableUniquePymtAccIdList = [...new Set(nullablePymtAccIdPKList.filter((pk) => pk !== null))];
  const detailsItemKeys = [...NonNullableUniquePymtAccIdList].map((pk) => ({ PK: pk }));

  const reqAttrs: Record<"ProjectionExpression", string> = {
    ProjectionExpression: "details.id,details.shortName,details.status",
  };
  const detailsItemList = await dbutil.batchGet<DbItemPymtAcc>(detailsItemKeys, _pymtAccTableName, reqAttrs, logger);
  logger.debug("retrieved partial projected attribute details");

  const pymtAccList: PartialPymtAcc[] = detailsItemList.map((dbItem) => ({
    id: dbItem.details.id,
    shortName: dbItem.details.shortName,
    status: dbItem.details.status,
  }));

  return pymtAccList;
};
