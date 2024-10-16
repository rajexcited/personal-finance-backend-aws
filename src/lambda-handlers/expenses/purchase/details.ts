import { InvalidError, JSONObject } from "../../apigateway";
import { DbConfigTypeDetails } from "../../config-type";
import { DbDetailsReceipt } from "../../receipts";
import { AuthorizeUser } from "../../user";
import { dbutil, getLogger, LoggerBase, utils } from "../../utils";
import { ExpenseBelongsTo, ExpenseStatus } from "../base-config";
import { DbItemExpense, ExpenseRecordType, ExpenseTableName, getFormattedExpenseDate, getGsiPkDetails } from "../db-config";
import { retrieveDbExpenseDetails } from "../db-config/details";
import { ApiResourcePurchaseDetails } from "./api-resource";
import { convertPurchaseDbToApiResource } from "./converter";
import {
  DbDetailsPurchase,
  DbDetailsPurchaseItem,
  DbPurchaseItemDetails,
  getGsiAttrDetailsPurchaseBelongsTo,
  getGsiSkPurchaseDate,
  getTablePkDetails,
  getTablePkItems,
} from "./db-config";
import { v4 as uuidv4 } from "uuid";

export const addDbPurchaseTransactions = async (
  req: ApiResourcePurchaseDetails,
  dbItem: DbItemExpense<DbDetailsPurchase> | null,
  dbReceipts: DbDetailsReceipt[],
  purchaseId: string,
  currencyProfile: DbConfigTypeDetails,
  authUser: AuthorizeUser,
  transactWriter: dbutil.TransactionWriter,
  logger: LoggerBase
) => {
  const dbPurchaseDetails = putDbPurchase(req, dbItem, dbReceipts, purchaseId, currencyProfile, authUser, transactWriter, logger);
  const dbPurchaseItems = await putDbPurchaseItems(req, purchaseId, dbItem, authUser, transactWriter, logger);

  const apiResource = await convertPurchaseDbToApiResource(dbPurchaseDetails.details, dbPurchaseItems?.details, authUser, logger);

  return apiResource;
};

const putDbPurchase = (
  req: ApiResourcePurchaseDetails,
  dbItem: DbItemExpense<DbDetailsPurchase> | null,
  dbReceipts: DbDetailsReceipt[],
  purchaseId: string,
  currencyProfile: DbConfigTypeDetails,
  authUser: AuthorizeUser,
  transactWriter: dbutil.TransactionWriter,
  _logger: LoggerBase
) => {
  const logger = getLogger("putDbPurchase", _logger);

  let formattedPurchaseDate = getFormattedExpenseDate(req.purchaseDate, logger);

  const auditDetails = utils.updateAuditDetailsFailIfNotExists(dbItem?.details.auditDetails, authUser);
  if (!auditDetails) {
    throw new InvalidError("auditDetails is null");
  }

  const apiToDbDetails: DbDetailsPurchase = {
    id: purchaseId,
    billName: req.billName,
    purchaseDate: formattedPurchaseDate,
    verifiedTimestamp: req.verifiedTimestamp,
    status: ExpenseStatus.ENABLE,
    amount: req.amount,
    purchaseTypeId: req.purchaseTypeId,
    paymentAccountId: req.paymentAccountId,
    receipts: dbReceipts,
    description: req.description,
    tags: req.tags,
    auditDetails: auditDetails,
    belongsTo: ExpenseBelongsTo.Purchase,
    recordType: ExpenseRecordType.Details,
    personIds: req.personIds,
    profileId: currencyProfile.id,
  };

  const dbItemPrch: DbItemExpense<DbDetailsPurchase> = {
    PK: getTablePkDetails(purchaseId, logger),
    US_GSI_PK: getGsiPkDetails(authUser.userId, apiToDbDetails.status, currencyProfile, logger),
    US_GSI_SK: getGsiSkPurchaseDate(apiToDbDetails.purchaseDate, logger),
    US_GSI_BELONGSTO: getGsiAttrDetailsPurchaseBelongsTo(logger),
    details: apiToDbDetails,
  };

  transactWriter.putItems(dbItemPrch as unknown as JSONObject, ExpenseTableName, logger);
  return dbItemPrch;
};

const putDbPurchaseItems = async (
  req: ApiResourcePurchaseDetails,
  purchaseId: string,
  dbItem: DbItemExpense<DbDetailsPurchase> | null,
  authUser: AuthorizeUser,
  transactWriter: dbutil.TransactionWriter,
  _logger: LoggerBase
) => {
  const logger = getLogger("putPurchaseItems", _logger);
  const existingPurchaseItems = await retrieveDbPurchaseItems(dbItem, logger);

  if (req.items && req.items.length > 0) {
    const existingPurchaseItemIdList = existingPurchaseItems?.details.items.map((itm) => itm.id) || [];
    const purchaseItems = req.items.map((ei) => {
      const isIdExist = existingPurchaseItemIdList.includes(ei.id);
      const expenseItem: DbPurchaseItemDetails = {
        id: isIdExist ? ei.id : uuidv4(),
        billName: ei.billName,
        tags: ei.tags,
        amount: ei.amount,
        description: ei.description,
        purchaseTypeId: ei.purchaseTypeId,
      };
      return expenseItem;
    });

    const auditDetails = utils.updateAuditDetailsFailIfNotExists(existingPurchaseItems?.details.auditDetails, authUser);
    if (!auditDetails) {
      throw new InvalidError("auditDetails is null");
    }
    const dbItemXpnsItems: DbItemExpense<DbDetailsPurchaseItem> = {
      PK: getTablePkItems(purchaseId, logger),
      US_GSI_PK: undefined,
      US_GSI_SK: undefined,
      US_GSI_BELONGSTO: undefined,
      details: {
        id: purchaseId,
        auditDetails,
        items: purchaseItems,
        recordType: ExpenseRecordType.Items,
      },
    };
    transactWriter.putItems(dbItemXpnsItems as unknown as JSONObject, ExpenseTableName, logger);
    return dbItemXpnsItems;
  } else if (existingPurchaseItems) {
    const itemsPk = getTablePkItems(purchaseId, logger);
    transactWriter.deleteItems(null, itemsPk, ExpenseTableName, logger);
  }
  return null;
};

export const retrieveDbPurchaseItems = async (dbPurchase: DbItemExpense<DbDetailsPurchase> | null, _logger: LoggerBase) => {
  const logger = getLogger("getDbPurchaseItems", _logger);
  if (!dbPurchase?.details.id) {
    return null;
  }
  const purchaseId = dbPurchase.details.id;
  const cmdInput = {
    TableName: ExpenseTableName,
    Key: { PK: getTablePkItems(purchaseId, logger) },
  };
  const prchItmsOutput = await dbutil.getItem(cmdInput, logger);

  logger.info("retrieved purchase items from DB");
  const dbPurchaseItem = prchItmsOutput.Item as DbItemExpense<DbDetailsPurchaseItem> | null;

  if (!dbPurchaseItem) {
    return null;
  }

  return dbPurchaseItem;
};

/**
 * Queries Database for purchase details and purchase Items
 *
 * @param purchaseId
 * @param authUser
 * @param _logger
 * @returns
 */
export const retrieveDbPurchaseToApiResource = async (purchaseId: string, authUser: AuthorizeUser, _logger: LoggerBase) => {
  const logger = getLogger("retrieveDbPurchase", _logger);
  const itemKeys = [{ PK: getTablePkDetails(purchaseId, logger) }, { PK: getTablePkItems(purchaseId, logger) }];
  const purchaseRecords = await dbutil.batchGet<DbItemExpense<DbDetailsPurchase | DbDetailsPurchaseItem>>(itemKeys, ExpenseTableName, {}, logger);
  logger.info("retrieved purchase from DB");

  const purchaseDetails = purchaseRecords.find((pr) => pr.details.recordType === ExpenseRecordType.Details) as DbItemExpense<DbDetailsPurchase>;
  const purchaseItemDetails = purchaseRecords.find((pr) => pr.details.recordType === ExpenseRecordType.Items) as DbItemExpense<DbDetailsPurchaseItem>;

  const apiResource = await convertPurchaseDbToApiResource(purchaseDetails?.details, purchaseItemDetails?.details, authUser, logger);
  return { apiResource, expenseDetails: purchaseDetails };
};

export const retrieveDbPurchaseDetails = async (purchaseId: string, logger: LoggerBase) => {
  const dbDetails = await retrieveDbExpenseDetails(purchaseId, ExpenseBelongsTo.Purchase, logger);

  if (dbDetails) {
    return dbDetails as DbItemExpense<DbDetailsPurchase>;
  }

  return null;
};
