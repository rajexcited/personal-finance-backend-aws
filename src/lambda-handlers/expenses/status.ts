import { APIGatewayProxyEvent } from "aws-lambda";
import { InvalidError, JSONObject, NotFoundError, UnAuthorizedError, ValidationError, apiGatewayHandlerWrapper } from "../apigateway";
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
import { AuditDetailsType, LoggerBase, dateutil, dbutil, getLogger, s3utils, utils } from "../utils";
import { getAuthorizeUser } from "../user";
import { ApiExpenseItemResource, ApiExpenseResource, ApiReceiptResource, DbItemExpense, DbItemExpenseItem } from "./resource-type";
import * as datetime from "date-and-time";
import { ReceiptActions, updateReceiptsIns3 } from "./receipt-details";
import { UpdateCommandInput } from "@aws-sdk/lib-dynamodb";

const DELETE_EXPENSE_EXPIRES_IN_SEC = Number(process.env.DELETE_EXPENSE_EXPIRES_IN_SEC);

export const deleteExpense = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("deleteExpense", _logger);

  const authUser = getAuthorizeUser(event);
  const expenseId = getValidatedExpenseIdFromPathParam(event, logger);

  const dbItem = await getValidatedExpenseFromDb(authUser.userId, expenseId, ExpenseStatus.ENABLE, logger);
  if (!dbItem.details.deletedTimestamp) {
    if (isNaN(DELETE_EXPENSE_EXPIRES_IN_SEC)) {
      throw new InvalidError("value of DELETE_EXPENSE_EXPIRES_IN_SEC is not a number. configured value is " + DELETE_EXPENSE_EXPIRES_IN_SEC);
    }
    const deleteGracefulTimeInSec = Math.ceil(datetime.addSeconds(new Date(), DELETE_EXPENSE_EXPIRES_IN_SEC + 1).getTime() / 1000);
    const xpnsCmdInput: UpdateCommandInput = {
      TableName: _expenseTableName,
      Key: { PK: getDetailsTablePk(dbItem.details.id) },
      UpdateExpression: "set #eak = :eav , #gpkk = :gpkv , #gskk = :gskv , #dtl.#deltmpstmpk = :dtv, #dtl.#stk = :stv",
      ExpressionAttributeValues: {
        ":eav": deleteGracefulTimeInSec,
        ":gpkv": getUserIdStatusDateGsiPk(authUser.userId, ExpenseStatus.DELETED),
        ":gskv": getUserIdStatusDateGsiSk(new Date(), logger),
        ":dtv": dateutil.formatTimestamp(new Date()),
        ":stv": ExpenseStatus.DELETED,
      },
      ExpressionAttributeNames: {
        "#eak": "ExpiresAt",
        "#gpkk": "UD_GSI_PK",
        "#gskk": "UD_GSI_SK",
        "#dtl": "details",
        "#deltmpstmpk": "deletedTimestamp",
        "#stk": "status",
      },
    };
    const updateAttrXpnsOutput = await dbutil.updateAttribute(xpnsCmdInput, logger);
    if (updateAttrXpnsOutput.Attributes === undefined) {
      logger.info("Expense is already deleted. this request cannot be fulfilled.");
      throw new NotFoundError("already deleted");
    }

    const xpnsItemCmdInput = {
      TableName: _expenseTableName,
      Key: { PK: getItemsTablePk(dbItem.details.id) },
      UpdateExpression: "set ExpiresAt = :eav",
      ExpressionAttributeValues: {
        ":eav": deleteGracefulTimeInSec,
      },
      ConditionExpression: "attribute_exists(details)",
    };
    const updateAttrXpnsItmOutputPromise = dbutil.updateAttribute(xpnsItemCmdInput, logger);

    const deleteReceiptAction: ReceiptActions = {
      dbReceiptsToRemove: [...dbItem.details.receipts],
      dbReceiptsWithNoChange: [],
      requestReceiptsToAdd: [],
      dbReceiptsToReverseRemove: [],
    };
    const deleteReceiptPromise = updateReceiptsIns3(deleteReceiptAction, null, expenseId, authUser.userId, logger);
    await Promise.all([updateAttrXpnsItmOutputPromise, deleteReceiptPromise]);
  }
  const auditDetails = await utils.parseAuditDetails(dbItem.details.auditDetails, authUser.userId, authUser);

  const apiReceipts = dbItem.details.receipts.map((dbReceipt) => {
    const apiReceipt: ApiReceiptResource = {
      id: dbReceipt.id,
      name: dbReceipt.name,
      contentType: dbReceipt.contentType,
      size: dbReceipt.size,
    };
    return apiReceipt;
  });

  const resource: ApiExpenseResource = {
    id: dbItem.details.id,
    billName: dbItem.details.billName,
    amount: dbItem.details.amount,
    expenseCategoryId: dbItem.details.expenseCategoryId,
    purchasedDate: dbItem.details.purchasedDate,
    verifiedTimestamp: dbItem.details.verifiedTimestamp,
    paymentAccountId: dbItem.details.paymentAccountId,
    receipts: apiReceipts,
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
  if (xpns.details.status === ExpenseStatus.ENABLE) {
    throw new ValidationError([{ path: ExpenseResourcePath.REQUEST, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const dbAuditDetails = utils.updateAuditDetails(xpns.details.auditDetails, authUser.userId) as AuditDetailsType;
  const xpns2: DbItemExpense = {
    PK: xpns.PK,
    UD_GSI_PK: getUserIdStatusDateGsiPk(authUser.userId, status),
    UD_GSI_SK: getUserIdStatusDateGsiSk(dbAuditDetails.updatedOn, logger) as string,
    UD_GSI_ATTR1: xpns.UD_GSI_ATTR1,
    details: {
      id: xpns.details.id,
      billName: xpns.details.billName,
      purchasedDate: xpns.details.purchasedDate,
      receipts: xpns.details.receipts,
      amount: xpns.details.amount,
      description: xpns.details.description,
      tags: xpns.details.tags,
      expenseCategoryId: xpns.details.expenseCategoryId,
      paymentAccountId: xpns.details.paymentAccountId,
      verifiedTimestamp: xpns.details.verifiedTimestamp,
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
  const transactPromise = transactWriter.executeTransaction();

  const undeleteReceiptAction: ReceiptActions = {
    dbReceiptsToRemove: [],
    dbReceiptsToReverseRemove: [...xpns2.details.receipts],
    dbReceiptsWithNoChange: [],
    requestReceiptsToAdd: [],
  };
  const undeletePromise = updateReceiptsIns3(undeleteReceiptAction, null, expenseId, authUser.userId, logger);
  await Promise.all([transactPromise, undeletePromise]);

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

  const apiReceipts = xpns2.details.receipts.map((dbReceipt) => {
    const apiReceipt: ApiReceiptResource = {
      id: dbReceipt.id,
      name: dbReceipt.name,
      contentType: dbReceipt.contentType,
      size: dbReceipt.size,
    };
    return apiReceipt;
  });

  const resource: ApiExpenseResource = {
    id: xpns2.details.id,
    billName: xpns2.details.billName,
    amount: xpns2.details.amount,
    expenseCategoryId: xpns2.details.expenseCategoryId,
    purchasedDate: xpns2.details.purchasedDate,
    verifiedTimestamp: xpns2.details.verifiedTimestamp,
    paymentAccountId: xpns2.details.paymentAccountId,
    receipts: apiReceipts,
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
  if (!getOutput.Item) {
    throw new NotFoundError("expense doesn't exist");
  }

  const dbItem = getOutput.Item as DbItemExpense;
  // validate user access
  const gsiPkForReq = getUserIdStatusDateGsiPk(userId, dbItem.details.status);
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
