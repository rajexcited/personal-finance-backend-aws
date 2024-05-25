import { APIGatewayProxyEvent } from "aws-lambda";
import {
  InvalidField,
  JSONObject,
  RequestBodyContentType,
  UnAuthorizedError,
  ValidationError,
  apiGatewayHandlerWrapper,
  convertToCreatedResponse,
} from "../apigateway";
import {
  ErrorMessage,
  ExpenseResourcePath,
  ExpenseStatus,
  _expenseReceiptsBucketName,
  _expenseTableName,
  _logger,
  getDetailsTablePk,
  getItemsTablePk,
  getUserIdStatusDateGsiAttribute1,
  getUserIdStatusDateGsiPk,
  getUserIdStatusDateGsiSk,
} from "./base-config";
import { AuditDetailsType, LoggerBase, dbutil, getLogger, utils, validations } from "../utils";
import { getAuthorizeUser, getValidatedUserId } from "../user";
import { v4 as uuidv4 } from "uuid";
import {
  isValidAmount,
  isValidBillName,
  isValidPurchaseDate,
  areValidReceipts,
  validateExpenseCategory,
  validateExpenseItems,
  validatePaymentAccount,
  validateTags,
} from "./validate";
import {
  ApiExpenseItemResource,
  ApiExpenseResource,
  ApiReceiptResource,
  DbExpenseDetails,
  DbExpenseItemDetails,
  DbItemExpense,
  DbItemExpenseItem,
  DbReceiptDetails,
} from "./resource-type";
import { StopWatch } from "stopwatch-node";
import { getReceiptActions, updateReceiptsIns3 } from "./receipt-details";

const addUpdateExpenseHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("addUpdateExpense", _logger);

  const req = await getValidatedRequestForUpdateDetails(event, logger);
  const authUser = getAuthorizeUser(event);
  // perform the add or update

  // find db record if any.
  const dbItem = await getValidatedDbItem(req, authUser.userId, logger);
  const expenseId = dbItem?.details.id || uuidv4();
  /**
   * for update expense,
   *
   * find differences of receipts
   * if added, validate temp path, so can be copied to correct s3 path
   * if removed, set object expire time,
   * if no update, in other words db receipt item is matching with api request resource, do nothing
   *
   * For add expense, all receipts goes to temp path, so validate and copy to s3
   */
  const receiptActions = await getReceiptActions(req, dbItem, authUser.userId, logger);
  if (!receiptActions) {
    throw new ValidationError([{ path: ExpenseResourcePath.RECEIPTS, message: ErrorMessage.INCORRECT_VALUE }]);
  }
  const dbExpenseItemsIdList = await getDbExpenseItemsIdList(dbItem, logger);

  const transactWriter = new dbutil.TransactionWriter(logger);
  // before db update for expense
  // receipts copy to s3 if required,
  // delete from s3 if required
  const dbReceipts = await updateReceiptsIns3(receiptActions, req, expenseId, authUser.userId, logger);
  const dbExpense = await putExpense(req, dbItem, dbReceipts, expenseId, authUser.userId, transactWriter, logger);
  const dbExpenseItems = await putExpenseItem(req, expenseId, dbExpenseItemsIdList, transactWriter, logger);

  await transactWriter.executeTransaction();

  const auditDetails = await utils.parseAuditDetails(dbExpense.details.auditDetails, authUser.userId, authUser);
  const apiResource = await getExpenseApiResource(dbExpense, dbExpenseItems, auditDetails, logger);

  const result = apiResource as unknown as JSONObject;
  if (!dbItem) {
    return convertToCreatedResponse(result);
  }
  return result;
};
export const addUpdateExpense = apiGatewayHandlerWrapper(addUpdateExpenseHandler, RequestBodyContentType.JSON);

const putExpense = async (
  req: ApiExpenseResource,
  dbItem: DbItemExpense | null,
  dbReceipts: DbReceiptDetails[],
  expenseId: string,
  userId: string,
  transactWriter: dbutil.TransactionWriter,
  _logger: LoggerBase
) => {
  const logger = getLogger("putExpense", _logger);
  const auditDetails = utils.updateAuditDetails(dbItem?.details.auditDetails, userId) as AuditDetailsType;

  const apiToDbDetails: DbExpenseDetails = {
    id: expenseId,
    billName: req.billName,
    purchasedDate: req.purchasedDate,
    verifiedTimestamp: req.verifiedTimestamp,
    status: ExpenseStatus.ENABLE,
    amount: req.amount,
    expenseCategoryId: req.expenseCategoryId,
    paymentAccountId: req.paymentAccountId,
    receipts: dbReceipts,
    description: req.description,
    tags: req.tags,
    auditDetails: auditDetails,
  };

  const dbItemXpns: DbItemExpense = {
    PK: getDetailsTablePk(expenseId),
    UD_GSI_PK: getUserIdStatusDateGsiPk(userId, apiToDbDetails.status),
    UD_GSI_SK: getUserIdStatusDateGsiSk(auditDetails?.updatedOn as string, logger) as string,
    UD_GSI_ATTR1: getUserIdStatusDateGsiAttribute1(apiToDbDetails.purchasedDate, logger) as string,
    details: apiToDbDetails,
  };

  transactWriter.putItems(dbItemXpns as unknown as JSONObject, _expenseTableName, logger);
  return dbItemXpns;
};

const putExpenseItem = async (
  req: ApiExpenseResource,
  expenseId: string,
  existingExpenseItemsId: string[],
  transactWriter: dbutil.TransactionWriter,
  _logger: LoggerBase
) => {
  const logger = getLogger("putExpenseItem", _logger);
  if (req.expenseItems && req.expenseItems.length > 0) {
    const expenseItems = req.expenseItems.map((ei) => {
      const isIdExist = existingExpenseItemsId.includes(ei.id as string);
      const expenseItem: DbExpenseItemDetails = {
        id: isIdExist ? (ei.id as string) : uuidv4(),
        billName: ei.billName,
        tags: ei.tags,
        amount: ei.amount,
        description: ei.description,
        expenseCategoryId: ei.expenseCategoryId,
      };
      return expenseItem;
    });

    const dbItemXpnsItems: DbItemExpenseItem = {
      PK: getItemsTablePk(expenseId),
      details: {
        expenseId,
        items: expenseItems,
      },
    };
    transactWriter.putItems(dbItemXpnsItems as unknown as JSONObject, _expenseTableName, logger);
    return dbItemXpnsItems;
  } else if (existingExpenseItemsId.length > 0) {
    const itemsPk = getItemsTablePk(expenseId);
    transactWriter.deleteItems(null, itemsPk, _expenseTableName, logger);
  }
  return null;
};

const getExpenseApiResource = async (
  dbExpense: DbItemExpense,
  dbExpenseItems: DbItemExpenseItem | null,
  resourceAuditDetails: AuditDetailsType,
  _logger: LoggerBase
) => {
  const logger = getLogger("getExpenseApiResource", _logger);

  const apiItems: ApiExpenseItemResource[] = (dbExpenseItems?.details.items || []).map((item) => {
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

  const apiReceiptPromises = dbExpense.details.receipts.map(async (rct) => {
    const apiRct: ApiReceiptResource = {
      id: rct.id,
      name: rct.name,
      size: rct.size,
      contentType: rct.contentType,
    };
    return apiRct;
  });
  const apiReceipts = await Promise.all(apiReceiptPromises);

  const apiResource: ApiExpenseResource = {
    id: dbExpense.details.id,
    billName: dbExpense.details.billName,
    purchasedDate: dbExpense.details.purchasedDate,
    verifiedTimestamp: dbExpense.details.verifiedTimestamp,
    amount: dbExpense.details.amount,
    description: dbExpense.details.description,
    expenseCategoryId: dbExpense.details.expenseCategoryId,
    paymentAccountId: dbExpense.details.paymentAccountId,
    status: dbExpense.details.status,
    receipts: apiReceipts,
    tags: dbExpense.details.tags,
    auditDetails: resourceAuditDetails,
    expenseItems: apiItems,
  };

  logger.info("apiResource =", apiResource);
  return apiResource;
};

const getValidatedRequestForUpdateDetails = async (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const sw = new StopWatch("validateRequest");
  const logger = getLogger("validateRequest", _logger);

  try {
    sw.start();

    const req: ApiExpenseResource | null = utils.getJsonObj(event.body as string);
    logger.info("request =", req);

    if (!req) {
      throw new ValidationError([{ path: ExpenseResourcePath.REQUEST, message: ErrorMessage.MISSING_VALUE }]);
    }

    const userId = getValidatedUserId(event);
    const invalidFields: InvalidField[] = [];
    if (req.status && req.status !== ExpenseStatus.ENABLE) {
      invalidFields.push({ path: ExpenseResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE });
    }
    if (!isValidBillName(req.billName)) {
      const msg = req.billName ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
      invalidFields.push({ path: ExpenseResourcePath.BILLNAME, message: msg });
    }
    if (req.amount && !isValidAmount(req.amount)) {
      invalidFields.push({ path: ExpenseResourcePath.AMOUNT, message: ErrorMessage.INCORRECT_FORMAT });
    }
    if (req.description && !validations.isValidDescription(req.description)) {
      invalidFields.push({ path: ExpenseResourcePath.DESCRIPTION, message: ErrorMessage.INCORRECT_FORMAT });
    }
    if (req.id && !validations.isValidUuid(req.id)) {
      invalidFields.push({ path: ExpenseResourcePath.ID, message: ErrorMessage.INCORRECT_FORMAT });
    }
    if (!isValidPurchaseDate(req.purchasedDate)) {
      const err = req.purchasedDate ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
      invalidFields.push({ path: ExpenseResourcePath.PURCHASE_DATE, message: err });
    }
    if (req.verifiedTimestamp && !validations.isValidDate(req.verifiedTimestamp, logger)) {
      invalidFields.push({ path: ExpenseResourcePath.VERIFIED_TIMESTAMP, message: ErrorMessage.INCORRECT_FORMAT });
    }
    req.receipts = req.receipts || [];
    if (!areValidReceipts(req.receipts, req.id, logger)) {
      invalidFields.push({ path: ExpenseResourcePath.RECEIPTS, message: ErrorMessage.INCORRECT_VALUE });
    }
    req.expenseItems = req.expenseItems || [];

    await validatePaymentAccount(req, invalidFields, userId, logger);
    await validateExpenseCategory(req, invalidFields, userId, logger);
    validateTags(req, invalidFields, logger);
    await validateExpenseItems(req.expenseItems, invalidFields, userId, logger);

    logger.info("invalidFields =", invalidFields);
    if (invalidFields.length > 0) {
      throw new ValidationError(invalidFields);
    }

    return req;
  } finally {
    sw.stop();
    logger.info("stopwatch summary: ", sw.shortSummary());
  }
};

const getValidatedDbItem = async (req: ApiExpenseResource, userId: string, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedDbItem", _logger);
  if (req.id) {
    // is it eligible for update?
    const cmdInput = {
      TableName: _expenseTableName,
      Key: { PK: getDetailsTablePk(req.id) },
    };
    const xpnsOutput = await dbutil.getItem(cmdInput, logger);

    logger.info("retrieved expense from DB");
    if (xpnsOutput.Item) {
      const dbItem = xpnsOutput.Item as DbItemExpense;
      // validate user access to config details
      const gsiPkForReq = getUserIdStatusDateGsiPk(userId, dbItem.details.status);
      if (gsiPkForReq !== dbItem.UD_GSI_PK || dbItem.ExpiresAt !== undefined) {
        // not same user
        logger.warn("gsiPkForReq =", gsiPkForReq, ", dbItem.UD_GSI_PK =", dbItem.UD_GSI_PK, ", dbItem.ExpiresAt =", dbItem.ExpiresAt);
        throw new UnAuthorizedError("not authorized to update expense details");
      }
      return dbItem;
    }
  }
  return null;
};

const getDbExpenseItemsIdList = async (dbExpenseItem: DbItemExpense | null, _logger: LoggerBase) => {
  const logger = getLogger("getExistingExpenseItemsId", _logger);
  if (!dbExpenseItem?.details.id) {
    return [];
  }
  const expenseId = dbExpenseItem.details.id;
  const cmdInput = {
    TableName: _expenseTableName,
    Key: { PK: getItemsTablePk(expenseId) },
  };
  const xpnsItmsOutput = await dbutil.getItem(cmdInput, logger);

  logger.info("retrieved expense items from DB");
  const dbItemXpnsItems = xpnsItmsOutput.Item as DbItemExpenseItem | null;

  return dbItemXpnsItems?.details.items.map((xpnsItem) => xpnsItem.id) || [];
};
