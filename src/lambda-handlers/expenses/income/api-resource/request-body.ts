import { APIGatewayProxyEvent } from "aws-lambda";
import { LoggerBase, validations } from "../../../utils";
import { ValidationError, InvalidField } from "../../../apigateway";
import { isConfigIdExists, ConfigBelongsTo, DbConfigTypeDetails } from "../../../config-type";
import { isPaymentAccountExists } from "../../../pymt-acc";
import { getValidatedUserId } from "../../../user";
import { ErrorMessage, expenseFieldValidator } from "../../api-resource";
import { ApiResourceIncomeDetails } from "./resource-type";
import { IncomeRequestResourcePath } from "./error";
import { getValidatedRequestToUpdateExpenseDetails } from "../../api-resource/request-body";

export const getValidatedRequestToUpdateIncomeDetails = async (
  event: APIGatewayProxyEvent,
  currencyProfile: DbConfigTypeDetails,
  logger: LoggerBase
) => {
  const req = (await getValidatedRequestToUpdateExpenseDetails(event, logger)) as ApiResourceIncomeDetails;

  const userId = getValidatedUserId(event);
  const invalidFields: InvalidField[] = [];
  if (req.amount && !expenseFieldValidator.isValidAmount(req.amount)) {
    invalidFields.push({ path: IncomeRequestResourcePath.AMOUNT, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (!expenseFieldValidator.isValidExpenseDate(req.incomeDate, logger)) {
    const err = req.incomeDate ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: IncomeRequestResourcePath.INCOME_DATE, message: err });
  }
  if (req.verifiedTimestamp && !expenseFieldValidator.isValidVerifiedTimestamp(req.verifiedTimestamp, logger)) {
    invalidFields.push({ path: IncomeRequestResourcePath.VERIFIED_TIMESTAMP, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (!validations.isValidUuid(req.incomeTypeId)) {
    invalidFields.push({ path: IncomeRequestResourcePath.INCOME_TYPE, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.paymentAccountId && !validations.isValidUuid(req.paymentAccountId)) {
    invalidFields.push({ path: IncomeRequestResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_FORMAT });
  }

  logger.info("invalidFields =", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  const isValidIncomeType = await isConfigIdExists(req.incomeTypeId, ConfigBelongsTo.IncomeType, userId, logger);
  if (!isValidIncomeType) {
    throw new ValidationError([{ path: IncomeRequestResourcePath.INCOME_TYPE, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  const isValidPymtAccId = await isPaymentAccountExists(req.paymentAccountId, userId, currencyProfile, logger);
  if (!isValidPymtAccId) {
    throw new ValidationError([{ path: IncomeRequestResourcePath.PAYMENT_ACCOUNT, message: ErrorMessage.INCORRECT_VALUE }]);
  }

  return req;
};
