import { APIGatewayProxyEvent } from "aws-lambda";
import { apiGatewayHandlerWrapper, InvalidError, JSONObject, NotFoundError, ValidationError } from "../apigateway";
import { dateutil, dbutil, getLogger, LoggerBase, utils } from "../utils";
import { AuthorizeUser, getAuthorizeUser } from "../user";
import { ErrorMessage, getValidatedBelongsToPathParam, getValidatedExpenseIdPathParam } from "./api-resource";
import { ExpenseBelongsTo, ExpenseStatus } from "./base-config";
import { convertPurchaseDbToApiResource, DbDetailsPurchaseItem, retrieveDbPurchaseDetails, retrieveDbPurchaseItems } from "./purchase";
import { getGsiPkDetails, validateExpenseAuthorization } from "./db-config/details";
import { DbDetailsType, DbItemExpense, DbTagsType, ExpenseTableName, getGsiPkExpenseTags, retrieveDbTags } from "./db-config";
import { ReceiptActions } from "../receipts/receipt-actions";
import { updateReceiptsIns3 } from "../receipts";
import { DbDetailsPurchase } from "./purchase";
import { retrieveDbIncomeDetails } from "./income";
import { retrieveDbRefundDetails } from "./refund";
import { DbConfigTypeDetails, getDefaultCurrencyProfile } from "../config-type";

const DELETE_EXPENSE_EXPIRES_IN_SEC = Number(process.env.DELETE_EXPENSE_EXPIRES_IN_SEC);

enum PurchaseResourcePath {
  STATUS = "status",
}

const rootLogger = getLogger("expense.status");

export const deleteExpenseDetails = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("handler", rootLogger);

  const authUser = getAuthorizeUser(event);
  const expenseId = getValidatedExpenseIdPathParam(event, logger);
  const belongsToParam = getValidatedBelongsToPathParam(event, logger);
  const currencyProfile = await getDefaultCurrencyProfile(authUser.userId, logger);
  const dbExpense = await getValidatedDbDetails(authUser, expenseId, belongsToParam, ExpenseStatus.ENABLE, currencyProfile, logger);

  if (isNaN(DELETE_EXPENSE_EXPIRES_IN_SEC)) {
    throw new InvalidError("value of DELETE_EXPENSE_EXPIRES_IN_SEC is not a number. configured value is " + DELETE_EXPENSE_EXPIRES_IN_SEC);
  }

  const deleteGracefulTimeInSec = Math.ceil(dateutil.addSeconds(new Date(), DELETE_EXPENSE_EXPIRES_IN_SEC + 1).getTime() / 1000);
  const dbDtlAuditDetails = utils.updateAuditDetailsFailIfNotExists(dbExpense.details.auditDetails, authUser);

  const deletingDbDetails: DbItemExpense<DbDetailsType> = {
    PK: dbExpense.PK,
    US_GSI_PK: getGsiPkDetails(authUser.userId, ExpenseStatus.DELETED, currencyProfile, logger),
    US_GSI_SK: dbExpense.US_GSI_SK,
    US_GSI_BELONGSTO: dbExpense.US_GSI_BELONGSTO,
    ExpiresAt: deleteGracefulTimeInSec,
    details: {
      ...dbExpense.details,
      status: ExpenseStatus.DELETED,
      auditDetails: dbDtlAuditDetails,
    },
  };

  const writer = new dbutil.TransactionWriter(logger);
  writer.putItems(deletingDbDetails as unknown as JSONObject, ExpenseTableName);

  const dbTags = await retrieveDbTags(expenseId, belongsToParam, logger);

  if (dbTags) {
    const dbTagsAuditDetails = utils.updateAuditDetailsFailIfNotExists(dbTags.details.auditDetails, authUser);
    const deletingDbTags: DbItemExpense<DbTagsType> = {
      PK: dbTags.PK,
      US_GSI_PK: getGsiPkExpenseTags(authUser.userId, ExpenseStatus.DELETED, belongsToParam, logger),
      US_GSI_SK: dbTags.US_GSI_SK,
      US_GSI_BELONGSTO: dbTags.US_GSI_BELONGSTO,
      ExpiresAt: deleteGracefulTimeInSec,
      details: {
        ...dbTags.details,
        auditDetails: dbTagsAuditDetails,
      },
    };

    writer.putItems(deletingDbTags as unknown as JSONObject, ExpenseTableName);
  }

  let apiResource;
  if (dbExpense.details.belongsTo === ExpenseBelongsTo.Purchase) {
    const dbPurchaseItem = await retrieveDbPurchaseItems(dbExpense as DbItemExpense<DbDetailsPurchase>, logger);

    if (dbPurchaseItem) {
      const dbItmAuditDetails = utils.updateAuditDetailsFailIfNotExists(dbPurchaseItem.details.auditDetails, authUser);
      const deletingDbItem: DbItemExpense<DbDetailsPurchaseItem> = {
        PK: dbPurchaseItem.PK,
        US_GSI_PK: undefined,
        US_GSI_SK: undefined,
        US_GSI_BELONGSTO: undefined,
        ExpiresAt: deleteGracefulTimeInSec,
        details: {
          ...dbPurchaseItem.details,
          auditDetails: dbItmAuditDetails,
        },
      };

      writer.putItems(deletingDbItem as unknown as JSONObject, ExpenseTableName);
    }
    apiResource = await convertPurchaseDbToApiResource(dbExpense.details, null, authUser, logger);
  }

  const transactionWriterPromise = writer.executeTransaction();

  const deleteReceiptAction: ReceiptActions = {
    dbReceiptsToRemove: [...dbExpense.details.receipts],
    dbReceiptsWithNoChange: [],
    requestReceiptsToAdd: [],
    dbReceiptsToReverseRemove: [],
  };
  const deleteReceiptPromise = updateReceiptsIns3(deleteReceiptAction, null, expenseId, authUser.userId, logger);
  await Promise.all([transactionWriterPromise, deleteReceiptPromise]);

  return apiResource as unknown as JSONObject;
});

const getValidatedDbDetails = async (
  authUser: AuthorizeUser,
  expenseId: string,
  belongsTo: ExpenseBelongsTo,
  currentStatus: ExpenseStatus,
  currencyProfile: DbConfigTypeDetails,
  _logger: LoggerBase
) => {
  const logger = getLogger("getValidatedDbDetails", _logger);

  logger.info("request, expenseId =", expenseId, ", belongsTo =", belongsTo, ", current status =", currentStatus);

  let dbDetails;
  if (belongsTo === ExpenseBelongsTo.Purchase) {
    dbDetails = await retrieveDbPurchaseDetails(expenseId, logger);
  } else if (belongsTo === ExpenseBelongsTo.Income) {
    dbDetails = await retrieveDbIncomeDetails(expenseId, logger);
  } else if (belongsTo === ExpenseBelongsTo.Refund) {
    dbDetails = await retrieveDbRefundDetails(expenseId, logger);
  }

  if (!dbDetails) {
    throw new NotFoundError("expense doesn't exist");
  }

  validateExpenseAuthorization(dbDetails, authUser, currencyProfile, logger);

  if (dbDetails.details.status !== currentStatus) {
    throw new ValidationError([{ path: PurchaseResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return dbDetails;
};
