import { APIGatewayProxyEvent } from "aws-lambda";
import {
  JSONObject,
  RequestBodyContentType,
  UnAuthorizedError,
  ValidationError,
  apiGatewayHandlerWrapper,
  convertToCreatedResponse,
} from "../apigateway";
import { LoggerBase, dbutil, getLogger, utils } from "../utils";
import { AuthorizeUser, getAuthorizeUser } from "../user";
import { v4 as uuidv4 } from "uuid";
import { StopWatch } from "stopwatch-node";
import { getReceiptActions, updateReceiptsIns3 } from "../receipts";
import { ApiResourceExpense, ErrorMessage, ExpenseRequestResourcePath, getValidatedBelongsToPathParam } from "./api-resource";
import {
  DbDetailsType,
  DbItemExpense,
  DbTagsType,
  ExpenseRecordType,
  ExpenseTableName,
  getGsiAttrDetailsBelongsTo,
  getGsiPkDetails,
  getGsiPkExpenseTags,
  getTablePkExpenseTags,
} from "./db-config";
import { ExpenseStatus, ExpenseBelongsTo } from "./base-config";
import {
  addDbPurchaseTransactions,
  ApiResourcePurchaseDetails,
  retrieveDbPurchaseDetails,
  getGsiSkPurchaseDate,
  getValidatedRequestToUpdatePurchaseDetails,
  DbDetailsPurchase,
} from "./purchase";
import {
  getValidatedRequestToUpdateRefundDetails,
  ApiResourceRefundDetails,
  DbDetailsRefund,
  retrieveDbRefundDetails,
  addDbRefundTransactions,
} from "./refund";
import {
  ApiResourceIncomeDetails,
  getValidatedRequestToUpdateIncomeDetails,
  addDbIncomeTransactions,
  retrieveDbIncomeDetails,
  DbDetailsIncome,
} from "./income";

const rootLogger = getLogger("purchase.add-update");

const addUpdateHandler = async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("handler", rootLogger);

  const req = await getValidatedRequestForUpdateDetails(event, logger);
  const authUser = getAuthorizeUser(event);
  // perform the add or update

  // find db record if any.
  const dbItem = await getValidatedDbItem(req, authUser.userId, logger);
  const purchaseId = dbItem?.details.id || uuidv4();
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
  const receiptActions = await getReceiptActions(req, dbItem?.details.receipts, authUser.userId, logger);
  if (!receiptActions) {
    throw new ValidationError([{ path: ExpenseRequestResourcePath.RECEIPTS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const transactWriter = new dbutil.TransactionWriter(logger);
  // before db update for expense
  // receipts copy to s3 if required,
  // delete from s3 if required
  const dbReceipts = await updateReceiptsIns3(receiptActions, req, purchaseId, authUser.userId, logger);

  let apiResource;
  if (req.belongsTo === ExpenseBelongsTo.Purchase) {
    apiResource = await addDbPurchaseTransactions(
      req,
      dbItem as DbItemExpense<DbDetailsPurchase>,
      dbReceipts,
      purchaseId,
      authUser,
      transactWriter,
      logger
    );
  } else if (req.belongsTo === ExpenseBelongsTo.Refund) {
    apiResource = await addDbRefundTransactions(
      req,
      dbItem as DbItemExpense<DbDetailsRefund>,
      dbReceipts,
      purchaseId,
      authUser,
      transactWriter,
      logger
    );
  } else if (req.belongsTo === ExpenseBelongsTo.Income) {
    apiResource = await addDbIncomeTransactions(
      req,
      dbItem as DbItemExpense<DbDetailsIncome>,
      dbReceipts,
      purchaseId,
      authUser,
      transactWriter,
      logger
    );
  }
  if (apiResource) {
    await putExpenseTags(apiResource, dbItem, authUser, transactWriter, logger);
  }

  await transactWriter.executeTransaction();

  const result = apiResource as unknown as JSONObject;
  if (!dbItem) {
    return convertToCreatedResponse(result);
  }
  return result;
};

export const addUpdateDetails = apiGatewayHandlerWrapper(addUpdateHandler, RequestBodyContentType.JSON);

const putExpenseTags = async (
  apiResource: ApiResourceExpense,
  existingDbExpense: DbItemExpense<DbDetailsType> | null,
  authUser: AuthorizeUser,
  transactWriter: dbutil.TransactionWriter,
  _logger: LoggerBase
) => {
  const logger = getLogger("putExpenseTags", _logger);

  const newTagSet = new Set(apiResource.tags);
  if (apiResource.belongsTo === ExpenseBelongsTo.Purchase) {
    const purchaseResource = apiResource as ApiResourcePurchaseDetails;
    purchaseResource.items.flatMap((item) => item.tags).forEach(newTagSet.add);
  }
  logger.info("size of new tags = ", newTagSet.size);

  // skipping db call if no tags to add / update
  if (newTagSet.size === 0 && !existingDbExpense) {
    return null;
  }
  const existingExpenseDbTags = await getExistingDbPurchaseTags(existingDbExpense?.details.id, apiResource.belongsTo, logger);

  // find difference from old tags to new updating tags. if not found any, skipping db call
  const shouldUpdateWithNewTags =
    existingExpenseDbTags?.tags.length === newTagSet.size ? !!existingExpenseDbTags.tags.find((tg) => !newTagSet.has(tg)) : true;
  if (!shouldUpdateWithNewTags) {
    return null;
  }

  let expenseDate;
  if (apiResource.belongsTo === ExpenseBelongsTo.Purchase) {
    expenseDate = (apiResource as ApiResourcePurchaseDetails).purchaseDate;
  } else if (apiResource.belongsTo === ExpenseBelongsTo.Income) {
    expenseDate = (apiResource as ApiResourceIncomeDetails).incomeDate;
  } else if (apiResource.belongsTo === ExpenseBelongsTo.Refund) {
    expenseDate = (apiResource as ApiResourceRefundDetails).refundDate;
  } else if (apiResource.belongsTo === ExpenseBelongsTo.Investment) {
    expenseDate = (apiResource as ApiResourceIncomeDetails).incomeDate;
  }

  const auditDetails = utils.updateAuditDetailsFailIfNotExists(existingExpenseDbTags?.auditDetails, authUser);
  const dbExpenseTags: DbItemExpense<DbTagsType> = {
    PK: getTablePkExpenseTags(apiResource.id, apiResource.belongsTo, logger),
    US_GSI_PK: getGsiPkExpenseTags(authUser.userId, ExpenseStatus.ENABLE, apiResource.belongsTo, logger),
    US_GSI_SK: getGsiSkPurchaseDate(expenseDate, logger),
    US_GSI_BELONGSTO: getGsiAttrDetailsBelongsTo(apiResource.belongsTo, logger),
    details: {
      id: apiResource.id,
      belongsTo: apiResource.belongsTo,
      recordType: ExpenseRecordType.Tags,
      auditDetails: auditDetails,
      tags: [...newTagSet],
    },
  };

  transactWriter.putItems(dbExpenseTags as unknown as JSONObject, ExpenseTableName, logger);
  return dbExpenseTags;
};

const getValidatedRequestForUpdateDetails = async (event: APIGatewayProxyEvent, _logger: LoggerBase) => {
  const sw = new StopWatch("validateRequest");
  const logger = getLogger("validateRequest", _logger);

  try {
    sw.start();

    const belongsToParam = getValidatedBelongsToPathParam(event, logger);
    if (belongsToParam === ExpenseBelongsTo.Purchase) {
      const req = await getValidatedRequestToUpdatePurchaseDetails(event, logger);
      req.belongsTo = belongsToParam;
      return req;
    }
    if (belongsToParam === ExpenseBelongsTo.Income) {
      const req = await getValidatedRequestToUpdateIncomeDetails(event, logger);
      req.belongsTo = belongsToParam;
      return req;
    }
    if (belongsToParam === ExpenseBelongsTo.Refund) {
      const req = await getValidatedRequestToUpdateRefundDetails(event, logger);
      req.belongsTo = belongsToParam;
      return req;
    }
    if (belongsToParam === ExpenseBelongsTo.Investment) {
      // return getValidatedRequestToUpdateInvestmentDetails(event, logger);
    }

    throw new ValidationError([{ path: ExpenseRequestResourcePath.REQUEST, message: ErrorMessage.MISSING_VALUE }]);
  } finally {
    sw.stop();
    logger.info("stopwatch summary: ", sw.shortSummary());
  }
};

const getValidatedDbItem = async (req: ApiResourceExpense, userId: string, _logger: LoggerBase) => {
  const logger = getLogger("getValidatedDbItem", _logger);
  let dbExpense = null;
  if (req.belongsTo === ExpenseBelongsTo.Purchase) {
    dbExpense = await retrieveDbPurchaseDetails(req.id, logger);
  } else if (req.belongsTo === ExpenseBelongsTo.Income) {
    dbExpense = await retrieveDbIncomeDetails(req.id, logger);
  } else if (req.belongsTo === ExpenseBelongsTo.Refund) {
    dbExpense = await retrieveDbRefundDetails(req.id, logger);
  }

  if (!dbExpense) {
    return null;
  }
  // is it eligible for update?
  // validate user access to config details
  const gsiPkForReq = getGsiPkDetails(userId, ExpenseStatus.ENABLE, logger);
  if (gsiPkForReq !== dbExpense.US_GSI_PK) {
    // not same user
    logger.warn("gsiPkForReq =", gsiPkForReq, ", dbItem.US_GSI_PK =", dbExpense.US_GSI_PK);
    throw new UnAuthorizedError("not authorized to update expense details");
  }

  if (dbExpense.ExpiresAt !== undefined) {
    logger.warn("getting deleted. dbExpense.ExpiresAt =", dbExpense.ExpiresAt);
    throw new UnAuthorizedError("not authorized to update purchase details");
  }

  if (dbExpense.details.status !== ExpenseStatus.ENABLE) {
    logger.warn("expense not enabled. dbExpense.details.status =", dbExpense.details.status);
    throw new UnAuthorizedError("not authorized to update disabled or deleted expense details");
  }
  return dbExpense;
};

const getExistingDbPurchaseTags = async (existingDbPurchaseId: string | null | undefined, belongsTo: ExpenseBelongsTo, _logger: LoggerBase) => {
  const logger = getLogger("getDbPurchaseTags", _logger);
  if (!existingDbPurchaseId) {
    return null;
  }

  const cmdInput = {
    TableName: ExpenseTableName,
    Key: { PK: getTablePkExpenseTags(existingDbPurchaseId, belongsTo, logger) },
  };
  const prchTagsOutput = await dbutil.getItem(cmdInput, logger);

  logger.info("retrieved purchase tags from DB");
  const dbPurchaseTags = prchTagsOutput.Item as DbItemExpense<DbTagsType> | null;

  if (!dbPurchaseTags) {
    return null;
  }

  return dbPurchaseTags.details;
};
