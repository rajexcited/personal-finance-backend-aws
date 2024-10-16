import { IllegelArgumentError } from "../../apigateway";
import { DbConfigTypeDetails } from "../../config-type";
import { ConfigResourcePath } from "../../config-type/base-config";
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

export const getGsiPk = (
  userId: string,
  status: ExpenseStatus,
  pkTypePrefix: string | null,
  pkType: ExpenseRecordType,
  currencyProfile: DbConfigTypeDetails | null,
  _logger: LoggerBase
) => {
  const logger = getLogger("getGsiPk", _logger);
  if (!pkType) {
    throw new IllegelArgumentError("type primary partition key is not given");
  }

  if (!userId || !status) {
    logger.debug("userId or status is not provisioned.", " userId =", userId, " status =", status);
    throw new IllegelArgumentError("userId or status is not provided to format gsi PK");
  }

  const parts = ["userId", userId];
  if (currencyProfile) {
    parts.push("profileCode", currencyProfile.name + currencyProfile.value);
  }
  parts.push("status", status);

  if (pkTypePrefix) {
    parts.push(pkTypePrefix);
  }
  parts.push(pkType);
  return parts.join("#");
};
