import { APIGatewayProxyEvent } from "aws-lambda";
import { LoggerBase, validations } from "../../../utils";
import { ValidationError, InvalidField } from "../../../apigateway";
import { isConfigIdExists, BelongsTo } from "../../../config-type";
import { isPaymentAccountExists } from "../../../pymt-acc";
import { getValidatedUserId } from "../../../user";
import { ErrorMessage, expenseFieldValidator } from "../../api-resource";
import { ApiResourceRefundDetails } from "./resource-type";
import { RefundRequestResourcePath } from "./error";
import { getValidatedRequestToUpdateExpenseDetails } from "../../api-resource/request-body";

export const getValidatedRequestToUpdateRefundDetails = async (event: APIGatewayProxyEvent, logger: LoggerBase) => {
  const req = getValidatedRequestToUpdateExpenseDetails(event, logger) as ApiResourceRefundDetails;

  const userId = getValidatedUserId(event);
  const invalidFields: InvalidField[] = [];
  if (!expenseFieldValidator.isValidAmount(req.amount)) {
    invalidFields.push({ path: RefundRequestResourcePath.AMOUNT, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (!expenseFieldValidator.isValidExpenseDate(req.refundDate, logger)) {
    const err = req.refundDate ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: RefundRequestResourcePath.REFUND_DATE, message: err });
  }
  if (!validations.isValidUuid(req.reasonId)) {
    invalidFields.push({ path: RefundRequestResourcePath.REASON, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.paymentAccountId && !validations.isValidUuid(req.paymentAccountId)) {
    invalidFields.push({ path: RefundRequestResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.purchaseId && !validations.isValidUuid(req.purchaseId)) {
    invalidFields.push({ path: RefundRequestResourcePath.PURCHASE, message: ErrorMessage.INCORRECT_VALUE });
  }

  logger.info("invalidFields =", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  const isValidRefundReason = await isConfigIdExists(req.reasonId, BelongsTo.RefundReason, userId, logger);
  if (!isValidRefundReason) {
    throw new ValidationError([{ path: RefundRequestResourcePath.REASON, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const isValidPymtAccId = await isPaymentAccountExists(req.paymentAccountId, userId, logger);
  if (!isValidPymtAccId) {
    throw new ValidationError([{ path: RefundRequestResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return req;
};
