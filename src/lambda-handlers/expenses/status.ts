import { APIGatewayProxyEvent } from "aws-lambda";
import { JSONObject, UnAuthorizedError, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
import {
  ErrorMessage,
  ExpenseResourcePath,
  ExpenseStatus,
  _expenseTableName,
  _logger,
  getDetailsTablePk,
  getItemsTablePk,
  getUserIdStatusDateGsiPk,
  getUserIdStatusDateGsiSk,
  getValidatedExpenseIdFromPathParam,
} from "./base-config";
import { AuditDetailsType, LoggerBase, dbutil, getLogger, utils } from "../utils";
import { getAuthorizeUser } from "../user";
import { ApiExpenseItemResource, ApiExpenseResource, DbItemExpense, DbItemExpenseItem } from "./resource-type";

export const deleteExpense = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("deleteExpense", _logger);

  const authUser = getAuthorizeUser(event);
  const expenseId = getValidatedExpenseIdFromPathParam(event, logger);

  const dbItem = await getValidatedExpenseFromDb(authUser.userId, expenseId, ExpenseStatus.ENABLE, logger);
  // allowing 10 seconds to revert back delete action
  const deleteGracefulTimeInSec = 10;
  const xpnsCmdInput = {
    TableName: _expenseTableName,
    Key: { PK: getDetailsTablePk(dbItem.details.id) },
    UpdateExpression: "set ExpiresAt = :eav , UD_GSI_PK = :gpkv , UD_GSI_SK = :gskv",
    ExpressionAttributeValues: {
      ":eav": deleteGracefulTimeInSec,
      ":gpkv": getUserIdStatusDateGsiPk(authUser.userId, ExpenseStatus.DELETED, false),
      ":gskv": getUserIdStatusDateGsiSk(new Date(), logger),
    },
  };
  const updateAttrXpnsOutputPromise = dbutil.updateAttribute(xpnsCmdInput, logger);
  const xpnsItemCmdInput = {
    TableName: _expenseTableName,
    Key: { PK: getItemsTablePk(dbItem.details.id) },
    UpdateExpression: "set ExpiresAt = :eav",
    ExpressionAttributeValues: {
      ":eav": deleteGracefulTimeInSec,
    },
  };
  const updateAttrXpnsItmOutputPromise = dbutil.updateAttribute(xpnsItemCmdInput, logger);

  await Promise.all([updateAttrXpnsOutputPromise, updateAttrXpnsItmOutputPromise]);
  const auditDetails = await utils.parseAuditDetails(dbItem.details.auditDetails, authUser.userId, authUser);

  const resource: ApiExpenseResource = {
    id: dbItem.details.id,
    billName: dbItem.details.billName,
    amount: dbItem.details.amount,
    expenseCategoryId: dbItem.details.expenseCategoryId,
    purchasedDate: dbItem.details.purchasedDate,
    verifiedTimestamp: dbItem.details.verifiedTimestamp,
    paymentAccountId: dbItem.details.paymentAccountId,
    receipts: dbItem.details.receipts,
    status: ExpenseStatus.DELETED,
    description: dbItem.details.description,
    tags: dbItem.details.tags,
    auditDetails: auditDetails,
  };
  return resource as unknown as JSONObject;
});

export const updateExpenseStatus = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("updateExpenseStatus", _logger);

  const authUser = getAuthorizeUser(event);
  const expenseId = getValidatedExpenseIdFromPathParam(event, logger);
  const status = getValidatedExpenseStatusFromPath(event, logger);
  if (status !== ExpenseStatus.ENABLE) {
    throw new ValidationError([{ path: ExpenseResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const xpnsPromise = getValidatedExpenseFromDb(authUser.userId, expenseId, ExpenseStatus.DELETED, logger);
  const cmdInput = {
    TableName: _expenseTableName,
    Key: { PK: getItemsTablePk(expenseId) },
  };
  const getOutputItemsPromise = dbutil.getItem(cmdInput, logger);
  const xpns = await xpnsPromise;
  if (typeof xpns.ExpiresAt !== "number") {
    throw new ValidationError([{ path: ExpenseResourcePath.REQUEST, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const dbAuditDetails = utils.updateAuditDetails(xpns.details.auditDetails, authUser.userId) as AuditDetailsType;
  const xpns2: DbItemExpense = {
    PK: xpns.PK,
    UD_GSI_PK: getUserIdStatusDateGsiPk(authUser.userId, status, false),
    UD_GSI_SK: getUserIdStatusDateGsiSk(dbAuditDetails.updatedOn, logger) as string,
    UD_GSI_ATTR1: xpns.UD_GSI_ATTR1,
    details: {
      ...xpns.details,
      status: status,
      auditDetails: dbAuditDetails,
    },
  };

  const transactWriter = new dbutil.TransactionWriter(logger);
  transactWriter.putItems(xpns2 as unknown as JSONObject, _expenseTableName, logger);

  const getOutputItems = await getOutputItemsPromise;
  const xpnsItems = getOutputItems.Item as DbItemExpenseItem;
  if (xpnsItems) {
    const xpnsItems2: DbItemExpenseItem = {
      PK: xpnsItems.PK,
      details: {
        expenseId: xpnsItems.details.expenseId,
        items: [...xpnsItems.details.items],
      },
    };
    transactWriter.putItems(xpnsItems2 as unknown as JSONObject, _expenseTableName, logger);
  }
  await transactWriter.executeTransaction();

  const auditDetails = await utils.parseAuditDetails(xpns2.details.auditDetails, authUser.userId, authUser);

  const apiItems: ApiExpenseItemResource[] = (xpnsItems?.details.items || []).map((item) => {
    const resource: ApiExpenseItemResource = {
      id: item.id,
      billName: item.billName,
      amount: item.amount,
      description: item.description,
      expenseCategoryId: item.expenseCategoryId,
      tags: item.tags,
    };

    return resource;
  });

  const resource: ApiExpenseResource = {
    id: xpns2.details.id,
    billName: xpns2.details.billName,
    amount: xpns2.details.amount,
    expenseCategoryId: xpns2.details.expenseCategoryId,
    purchasedDate: xpns2.details.purchasedDate,
    verifiedTimestamp: xpns2.details.verifiedTimestamp,
    paymentAccountId: xpns2.details.paymentAccountId,
    receipts: xpns2.details.receipts,
    status: xpns2.details.status,
    description: xpns2.details.description,
    tags: xpns2.details.tags,
    auditDetails: auditDetails,
    expenseItems: apiItems,
  };
  return resource as unknown as JSONObject;
});

export const getValidatedExpenseFromDb = async (userId: string, expenseId: string, status: ExpenseStatus, baseLogger: LoggerBase) => {
  const logger = getLogger("getValidatedExpenseFromDb", baseLogger);

  logger.info("request, expenseId =", expenseId, ", status =", status);
  const cmdInput = {
    TableName: _expenseTableName,
    Key: { PK: getDetailsTablePk(expenseId) },
  };
  const getOutput = await dbutil.getItem(cmdInput, logger);
  logger.info("retrieved db result output");

  const dbItem = getOutput.Item as DbItemExpense;
  // validate user access
  const gsiPkForReq = getUserIdStatusDateGsiPk(userId, dbItem.details.status, false);
  if (gsiPkForReq !== dbItem.UD_GSI_PK) {
    // not same user
    throw new UnAuthorizedError("not authorized to update status of expense");
  }

  return dbItem;
};

const getValidatedExpenseStatusFromPath = (event: APIGatewayProxyEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("getValidatedExpenseStatusFromPath", loggerBase);
  const xpnsStatus = event.pathParameters?.status;
  logger.info("path parameter, expense status =", xpnsStatus);

  if (!xpnsStatus) {
    throw new ValidationError([{ path: ExpenseResourcePath.STATUS, message: ErrorMessage.MISSING_VALUE }]);
  }

  if (xpnsStatus !== ExpenseStatus.ENABLE && xpnsStatus !== ExpenseStatus.DELETED) {
    throw new ValidationError([{ path: ExpenseResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return xpnsStatus as ExpenseStatus;
};
