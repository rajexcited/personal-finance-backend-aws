import { getTablePkExpenseDetails } from ".";
import { IllegelArgumentError, UnAuthorizedError } from "../../apigateway";
import { DbConfigTypeDetails } from "../../config-type";
import { AuthorizeUser } from "../../user";
import { getLogger, validations, dateutil, LoggerBase, dbutil } from "../../utils";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";
import { getGsiPk, getTablePK } from "./base";
import { DbDetailsType, DbItemExpense, ExpenseRecordType, ExpenseTableName } from "./field-types";

const EXPENSE_DATE_FORMAT = "YYYY-MM-DD";

export const getTablePkDetails = (id: string, belongsTo: ExpenseBelongsTo, _logger: LoggerBase) => {
  return getTablePK(id, belongsTo, ExpenseRecordType.Details, _logger);
};

export const getGsiPkDetails = (userId: string, status: ExpenseStatus, currencyProfile: DbConfigTypeDetails, _logger: LoggerBase) => {
  return getGsiPk(userId, status, null, ExpenseRecordType.Details, currencyProfile, _logger);
};

export const getGsiSkDetailsExpenseDate = (expenseDate: string | Date | undefined | null, _logger: LoggerBase) => {
  const logger = getLogger("getGsiSkDetailsExpenseDate", _logger);

  return `expenseDate#${getFormattedExpenseDate(expenseDate, logger)}`;
};

/**
 * formats expense date to @constant EXPENSE_DATE_FORMAT
 *
 * @param expenseDate
 * @param logger
 * @returns
 * @throws {IllegelArgumentError} if expenseDate is provided or not in incorrect format
 */
const getFormattedExpenseDate = (expenseDate: string | Date | undefined | null, logger: LoggerBase) => {
  let formattedExpenseDate;
  if (expenseDate instanceof Date) {
    formattedExpenseDate = dateutil.formatTimestamp(expenseDate, EXPENSE_DATE_FORMAT);
  } else if (typeof expenseDate === "string" && validations.isValidDate(expenseDate, logger, EXPENSE_DATE_FORMAT)) {
    formattedExpenseDate = expenseDate;
  } else if (expenseDate && validations.isValidDate(expenseDate, logger)) {
    const parseDate = dateutil.parseTimestamp(expenseDate);
    formattedExpenseDate = dateutil.formatTimestamp(parseDate, EXPENSE_DATE_FORMAT);
  }

  logger.debug("expense date =", expenseDate, ", formattedExpenseDate =", formattedExpenseDate);

  if (!formattedExpenseDate) {
    logger.warn("formatted expenseDate is not defined");
    throw new IllegelArgumentError("expenseDate is null, cannot be formatted");
  }

  return formattedExpenseDate;
};

export const getGsiAttrDetailsBelongsTo = (belongsTo: ExpenseBelongsTo | null | undefined, _logger: LoggerBase) => {
  const logger = getLogger("getGsiAttrDetailsBelongsTo", _logger);
  logger.debug("belongsTo =", belongsTo);
  if (!belongsTo) {
    throw new IllegelArgumentError("belongsTo is null");
  }
  return `expenseBelongsTo#${belongsTo}`;
};

export const validateExpenseAuthorization = (
  expenseDetails: DbItemExpense<DbDetailsType>,
  authUser: AuthorizeUser,
  currencyProfile: DbConfigTypeDetails,
  _logger: LoggerBase
) => {
  const logger = getLogger("validateExpenseAuthorization", _logger);
  // validate user access to config details
  const gsiPkForReq = getGsiPkDetails(authUser.userId, expenseDetails.details.status, currencyProfile, logger);
  if (gsiPkForReq !== expenseDetails.US_GSI_PK) {
    // not same user
    logger.warn("gsiPkForReq =", gsiPkForReq, ", dbItem.US_GSI_PK =", expenseDetails.US_GSI_PK);
    throw new UnAuthorizedError("expense detail is not authorized");
  }
};

export const retrieveDbExpenseDetails = async (expenseId: string, belongsTo: ExpenseBelongsTo, logger: LoggerBase) => {
  const cmdInput = {
    TableName: ExpenseTableName,
    Key: { PK: getTablePkExpenseDetails(expenseId, belongsTo, logger) },
  };
  const expenseOutput = await dbutil.getItem(cmdInput, logger);
  if (expenseOutput.Item) {
    logger.info("retrieved " + belongsTo + " from DB not null");
    return expenseOutput.Item as DbItemExpense<DbDetailsType>;
  }
  logger.info("retrieved purchase from DB is null");

  return null;
};
