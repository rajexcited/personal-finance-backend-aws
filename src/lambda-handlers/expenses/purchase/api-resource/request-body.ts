import { APIGatewayProxyEvent } from "aws-lambda";
import { getLogger, LoggerBase, validations } from "../../../utils";
import { ValidationError, InvalidField } from "../../../apigateway";
import { isConfigIdExists, ConfigBelongsTo, DbConfigTypeDetails } from "../../../config-type";
import { isPaymentAccountExists } from "../../../pymt-acc";
import { getValidatedUserId } from "../../../user";
import { ErrorMessage, expenseFieldValidator } from "../../api-resource";
import { ApiResourcePurchaseDetails, ApiResourcePurchaseItemDetails } from "./resource-type";
import { PurchaseRequestResourcePath } from "./error";
import { getValidatedRequestToUpdateExpenseDetails } from "../../api-resource/request-body";

export const getValidatedRequestToUpdatePurchaseDetails = async (
  event: APIGatewayProxyEvent,
  currencyProfile: DbConfigTypeDetails,
  logger: LoggerBase
) => {
  const req = (await getValidatedRequestToUpdateExpenseDetails(event, logger)) as ApiResourcePurchaseDetails;

  const userId = getValidatedUserId(event);
  const invalidFields: InvalidField[] = [];
  if (req.amount && !expenseFieldValidator.isValidAmount(req.amount)) {
    invalidFields.push({ path: PurchaseRequestResourcePath.AMOUNT, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (!expenseFieldValidator.isValidExpenseDate(req.purchaseDate, logger)) {
    const err = req.purchaseDate ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: PurchaseRequestResourcePath.PURCHASE_DATE, message: err });
  }
  if (req.verifiedTimestamp && !expenseFieldValidator.isValidVerifiedTimestamp(req.verifiedTimestamp, logger)) {
    invalidFields.push({ path: PurchaseRequestResourcePath.VERIFIED_TIMESTAMP, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (!validations.isValidUuid(req.purchaseTypeId)) {
    invalidFields.push({ path: PurchaseRequestResourcePath.PURCHASE_TYPE, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (!validations.isValidUuid(req.paymentAccountId)) {
    invalidFields.push({ path: PurchaseRequestResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_FORMAT });
  }

  req.items = req.items || [];
  await validateItems(req.items, invalidFields, logger);

  logger.info("invalidFields =", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  const isValidPurchaseType = await isConfigIdExists(req.purchaseTypeId, ConfigBelongsTo.PurchaseType, userId, logger);
  if (!isValidPurchaseType) {
    throw new ValidationError([{ path: PurchaseRequestResourcePath.PURCHASE_TYPE, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const isValidPymtAccId = await isPaymentAccountExists(req.paymentAccountId, userId, currencyProfile, logger);
  if (!isValidPymtAccId) {
    throw new ValidationError([{ path: PurchaseRequestResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  validateItemPurchaseExists(req.items, userId, logger);

  return req;
};

export const validateItems = async (
  purchaseItemDetailsList: ApiResourcePurchaseItemDetails[],
  invalidFields: InvalidField[],
  _logger: LoggerBase
) => {
  const logger = getLogger("validateItems", _logger);

  const invalidPrchItms = purchaseItemDetailsList.filter((ei) => {
    if (!validations.isValidUuid(ei.id)) return true;
    if (!expenseFieldValidator.isValidBillName(ei.billName)) return true;
    if (!expenseFieldValidator.isValidAmount(ei.amount)) return true;
    if (!expenseFieldValidator.isValidDescription(ei.description)) return true;
    if (!expenseFieldValidator.areTagsValid(ei.tags)) return true;
    if (ei.purchaseTypeId && !validations.isValidUuid(ei.purchaseTypeId)) return true;

    return false;
  });

  logger.warn("invalidExpItms.length =", invalidPrchItms.length, ", invalidExpItms =", invalidPrchItms);
  if (invalidPrchItms.length > 0) {
    invalidFields.push({ path: PurchaseRequestResourcePath.PURCHASE_ITEMS, message: ErrorMessage.INCORRECT_VALUE });
  }
};

const validateItemPurchaseExists = async (items: ApiResourcePurchaseItemDetails[], userId: string, _logger: LoggerBase) => {
  const logger = getLogger("arePurchaseTypeValid", _logger);
  let isValidPurchaseType = true;
  for (let i = 0; i < items.length; i++) {
    isValidPurchaseType = await isConfigIdExists(items[i].purchaseTypeId, ConfigBelongsTo.PurchaseType, userId, logger);
    logger.info("isValidPurchaseType =", isValidPurchaseType, ", i=", i, ", items[i] =", items[i]);
    if (!isValidPurchaseType) {
      throw new ValidationError([
        {
          path: PurchaseRequestResourcePath.PURCHASE_ITEMS + "." + PurchaseRequestResourcePath.PURCHASE_TYPE,
          message: ErrorMessage.INCORRECT_VALUE,
        },
      ]);
    }
  }
};
