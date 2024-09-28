import { IllegelArgumentError } from "../../apigateway";
import { getLogger, LoggerBase } from "../../utils";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";
import { ExpenseRecordType } from "./field-types";

export const getTablePK = (id: string, belongsTo: ExpenseBelongsTo, pkType: ExpenseRecordType, _logger: LoggerBase) => {
  const logger = getLogger("getTablePK", _logger);
  logger.debug("id =", id, " belongsTo =", belongsTo, " pkType =", pkType);
  if (!pkType) {
    throw new IllegelArgumentError("type primary partition key is not given");
  }
  if (!id) {
    throw new IllegelArgumentError("id is null. cannot build TablePK");
  }
  if (!belongsTo) {
    throw new IllegelArgumentError("belongsTo is null. cannot build TablePK");
  }
  return [belongsTo + "Id", id, pkType].join("#");
};

export const getGsiPk = (userId: string, status: ExpenseStatus, pkTypePrefix: string | null, pkType: ExpenseRecordType, _logger: LoggerBase) => {
  const logger = getLogger("getGsiPk", _logger);
  if (!pkType) {
    throw new IllegelArgumentError("type primary partition key is not given");
  }

  if (!userId || !status) {
    logger.debug("userId or status is not provisioned.", " userId =", userId, " status =", status);
    throw new IllegelArgumentError("userId or status is not provided to format gsi PK");
  }
  if (!pkTypePrefix) {
    return ["userId", userId, "status", status, pkType].join("#");
  }
  return ["userId", userId, "status", status, pkTypePrefix, pkType].join("#");
};
