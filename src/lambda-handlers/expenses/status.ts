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
  getTagsTablePk,
  getUserIdStatusDateGsiPk,
  getUserIdStatusDateGsiSk,
  getValidatedExpenseIdFromPathParam,
} from "./base-config";
import { AuditDetailsType, LoggerBase, dbutil, getLogger, utils } from "../utils";
import { getAuthorizeUser } from "../user";
import { ApiExpenseItemResource, ApiExpenseResource, ApiReceiptResource, DbItemExpense, DbItemExpenseItem } from "./resource-type";
import * as datetime from "date-and-time";
import { ReceiptActions, updateReceiptsIns3 } from "./receipt-details";
import { PutCommandInput } from "@aws-sdk/lib-dynamodb";

const DELETE_EXPENSE_EXPIRES_IN_SEC = Number(process.env.DELETE_EXPENSE_EXPIRES_IN_SEC);

export const deleteExpense = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("deleteExpense", _logger);

  const authUser = getAuthorizeUser(event);
  const expenseId = getValidatedExpenseIdFromPathParam(event, logger);

  const dbItem = await getValidatedExpenseFromDb(authUser.userId, expenseId, ExpenseStatus.ENABLE, logger);
  if (isNaN(DELETE_EXPENSE_EXPIRES_IN_SEC)) {
    throw new InvalidError("value of DELETE_EXPENSE_EXPIRES_IN_SEC is not a number. configured value is " + DELETE_EXPENSE_EXPIRES_IN_SEC);
  }
  const deleteGracefulTimeInSec = Math.ceil(datetime.addSeconds(new Date(), DELETE_EXPENSE_EXPIRES_IN_SEC + 1).getTime() / 1000);
  const dbAuditDetails = utils.updateAuditDetails(dbItem.details.auditDetails, authUser.userId) as AuditDetailsType;
  const deletingDbItem: DbItemExpense = {
    PK: dbItem.PK,
    UD_GSI_PK: getUserIdStatusDateGsiPk(authUser.userId, ExpenseStatus.DELETED),
    UD_GSI_SK: getUserIdStatusDateGsiSk(dbAuditDetails.updatedOn, logger) as string,
    UD_GSI_ATTR1: dbItem.UD_GSI_ATTR1,
    ExpiresAt: deleteGracefulTimeInSec,
    details: {
      ...dbItem.details,
      status: ExpenseStatus.DELETED,
      auditDetails: dbAuditDetails,
    },
  };
  const xpnsPutCmdInput: PutCommandInput = {
    TableName: _expenseTableName,
    Item: deletingDbItem,
  };
  const deleteExpensePromise = dbutil.putItem(xpnsPutCmdInput, logger);

  // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.UpdateExpressions.html
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

  const xpnsTagCmdInput = {
    TableName: _expenseTableName,
    Key: { PK: getTagsTablePk(dbItem.details.id) },
    UpdateExpression: "set ExpiresAt = :eav, UD_GSI_PK = :gpkv",
    ExpressionAttributeValues: {
      ":eav": deleteGracefulTimeInSec,
      ":gpkv": deletingDbItem.UD_GSI_PK,
    },
  };
  const updateAttrXpnsTagOutputPromise = dbutil.updateAttribute(xpnsTagCmdInput, logger);

  const deleteReceiptAction: ReceiptActions = {
    dbReceiptsToRemove: [...dbItem.details.receipts],
    dbReceiptsWithNoChange: [],
    requestReceiptsToAdd: [],
    dbReceiptsToReverseRemove: [],
  };
  const deleteReceiptPromise = updateReceiptsIns3(deleteReceiptAction, null, expenseId, authUser.userId, logger);
  await Promise.all([deleteExpensePromise, updateAttrXpnsItmOutputPromise, deleteReceiptPromise, updateAttrXpnsTagOutputPromise]);

  const apiReceipts = dbItem.details.receipts.map((dbReceipt) => {
    const apiReceipt: ApiReceiptResource = {
      id: dbReceipt.id,
      name: dbReceipt.name,
      contentType: dbReceipt.contentType,
      size: dbReceipt.size,
    };
    return apiReceipt;
  });

  const auditDetails = await utils.parseAuditDetails(deletingDbItem.details.auditDetails, authUser.userId, authUser);
  const resource: ApiExpenseResource = {
    id: deletingDbItem.details.id,
    billName: deletingDbItem.details.billName,
    amount: deletingDbItem.details.amount,
    expenseCategoryId: deletingDbItem.details.expenseCategoryId,
    purchasedDate: deletingDbItem.details.purchasedDate,
    verifiedTimestamp: deletingDbItem.details.verifiedTimestamp,
    paymentAccountId: deletingDbItem.details.paymentAccountId,
    receipts: apiReceipts,
    status: deletingDbItem.details.status,
    description: deletingDbItem.details.description,
    tags: deletingDbItem.details.tags,
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

  const xpnsTagCmdInput: dbutil.TransactionUpdateItem = {
    TableName: _expenseTableName,
    Key: { PK: getTagsTablePk(xpns.details.id) },
    UpdateExpression: "set UD_GSI_PK = :gpkv remove ExpiresAt",
    ExpressionAttributeValues: {
      ":gpkv": xpns2.UD_GSI_PK,
    },
  };
  transactWriter.updateItemAttributes(xpnsTagCmdInput, logger);

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

export const getValidatedExpenseFromDb = async (userId: string, expenseId: string, currentStatus: ExpenseStatus, baseLogger: LoggerBase) => {
  const logger = getLogger("getValidatedExpenseFromDb", baseLogger);

  logger.info("request, expenseId =", expenseId, ", current status =", currentStatus);
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
  if (!dbItem) {
    throw new NotFoundError("db item not exists");
  }
  // validate user access
  const gsiPkForReq = getUserIdStatusDateGsiPk(userId, dbItem.details.status);
  if (gsiPkForReq !== dbItem.UD_GSI_PK) {
    // not same user
    throw new UnAuthorizedError("not authorized to update status of expense");
  }

  if (dbItem.details.status !== currentStatus) {
    throw new ValidationError([{ path: ExpenseResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
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
