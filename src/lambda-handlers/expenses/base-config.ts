import { dateutil, LoggerBase } from "../utils";

export enum ExpenseStatus {
  ENABLE = "enable",
  DISABLE = "disable",
  DELETED = "deleted",
}

export enum ExpenseBelongsTo {
  Purchase = "purchase",
  Income = "income",
  Investment = "investment",
  Refund = "refund",
}

export const getStartDateBeforeMonths = (date: Date, months: number, logger?: LoggerBase) => {
  // if possible do round of date and include extra month to search if required.
  // for example, for date of April 1st, best to include extra previous month
  const startDate = dateutil.getMonthStartDate(date, null, logger);
  const newDate = dateutil.addMonths(startDate as Date, months + 1);
  return newDate;
};

export const getEndDateAfterMonths = (date: Date, months: number, logger?: LoggerBase) => {
  const newDate = dateutil.addMonths(date, months);
  const endDate = dateutil.getMonthEndDate(newDate, null, logger);
  return endDate as Date;
};
