import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONObject, NotFoundError, UnAuthorizedError, apiGatewayHandlerWrapper } from "../apigateway";
import { dbutil, getLogger, utils } from "../utils";
import {
  _expenseTableName,
  _logger,
  getDetailsTablePk,
  getItemsTablePk,
  getUserIdStatusDateGsiPk,
  getValidatedExpenseIdFromPathParam,
} from "./base-config";
import { getAuthorizeUser } from "../user";
import { ApiExpenseItemResource, ApiExpenseResource, DbItemExpense, DbItemExpenseItem } from "./resource-type";

export const getExpeseDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("getExpenseDetails", _logger);

  const expenseId = getValidatedExpenseIdFromPathParam(event, logger);
  const authUser = getAuthorizeUser(event);

  const itemKeys = [{ PK: getDetailsTablePk(expenseId) }, { PK: getItemsTablePk(expenseId) }];
  const xpnsRecords = await dbutil.batchGet<DbItemExpense | DbItemExpenseItem>(itemKeys, _expenseTableName, logger);
  logger.info("retrieved expense from DB");
  if (xpnsRecords.length === 0) {
    throw new NotFoundError("expense details is not found in db");
  }
  const xpns = xpnsRecords.find((item) => "UD_GSI_PK" in item) as DbItemExpense;
  const xpnsItems = xpnsRecords.find((item) => !("UD_GSI_PK" in item) && typeof item.ExpiresAt !== "number") as DbItemExpenseItem | null;

  if (!xpns) {
    throw new NotFoundError("expense details is not found in db");
  }

  // validate user access to config details
  const gsiPkForReq = getUserIdStatusDateGsiPk(authUser.userId, xpns.details.status, false);
  if (gsiPkForReq !== xpns.UD_GSI_PK || xpns.ExpiresAt !== undefined) {
    // not same user
    logger.warn("gsiPkForReq =", gsiPkForReq, ", dbItem.UD_GSI_PK =", xpns.UD_GSI_PK, ", dbItem.ExpiresAt =", xpns.ExpiresAt);
    throw new UnAuthorizedError("not authorized to get expense details");
  }

  const expenseItems = xpnsItems?.details.items.map((item) => {
    const xpns: ApiExpenseItemResource = {
      id: item.id,
      billName: item.billName,
      amount: item.amount,
      description: item.description,
      expenseCategoryId: item.expenseCategoryId,
      tags: item.tags,
    };
    return xpns;
  });
  const auditDetails = await utils.parseAuditDetails(xpns.details.auditDetails, authUser.userId, authUser);

  const resource: ApiExpenseResource = {
    id: xpns.details.id,
    billName: xpns.details.billName,
    amount: xpns.details.amount,
    expenseCategoryId: xpns.details.expenseCategoryId,
    purchasedDate: xpns.details.purchasedDate,
    verifiedTimestamp: xpns.details.verifiedTimestamp,
    paymentAccountId: xpns.details.paymentAccountId,
    receipts: xpns.details.receipts,
    status: xpns.details.status,
    description: xpns.details.description,
    tags: xpns.details.tags,
    auditDetails: auditDetails,
    expenseItems: expenseItems || [],
  };

  return resource as unknown as JSONObject;
});
