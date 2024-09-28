import { IllegelArgumentError } from "../../apigateway";
import { getLogger, dateutil, LoggerBase, dbutil } from "../../utils";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";
import { getGsiPk, getTablePK } from "./base";
import { DbItemExpense, DbTagsType, ExpenseRecordType, ExpenseTableName } from "./field-types";

export const getTablePkTags = (id: string, belongsTo: ExpenseBelongsTo, _logger: LoggerBase) => {
  return getTablePK(id, belongsTo, ExpenseRecordType.Tags, _logger);
};

export const getGsiPkTags = (userId: string, status: ExpenseStatus, belongsTo: ExpenseBelongsTo, _logger: LoggerBase) => {
  return getGsiPk(userId, status, belongsTo, ExpenseRecordType.Tags, _logger);
};

export const getGsiSkTagsYear = (dateOrYear: string | number, _logger: LoggerBase) => {
  let year: number;
  const logger = getLogger("getGsiSkTagsYear", _logger);
  if (typeof dateOrYear === "number") {
    year = dateOrYear;
  } else {
    year = dateutil.parseTimestamp(dateOrYear).getFullYear();
  }

  if (!year) {
    throw new IllegelArgumentError("year is null");
  }
  return ["year", year].join("#");
};

export const retrieveDbTags = async (expenseId: string, belongsTo: ExpenseBelongsTo, logger: LoggerBase) => {
  const cmdInput = {
    TableName: ExpenseTableName,
    Key: { PK: getTablePkTags(expenseId, belongsTo, logger) },
  };
  const output = await dbutil.getItem(cmdInput, logger);
  if (output.Item) {
    logger.info("retrieved tags from DB not null");
    return output.Item as DbItemExpense<DbTagsType>;
  }
  logger.info("retrieved tags from DB is null");

  return null;
};
