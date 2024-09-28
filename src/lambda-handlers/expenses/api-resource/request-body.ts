import { APIGatewayProxyEvent } from "aws-lambda";
import * as receiptValidator from "../../receipts/validate";
import { LoggerBase, utils } from "../../utils";
import { ApiResourceExpense } from "./resource-path";
import { InvalidField, ValidationError } from "../../apigateway";
import { ErrorMessage, ExpenseRequestResourcePath } from "./error";
import { ExpenseStatus } from "../base-config";
import * as fieldValidator from "./prop-validator";

export const getValidatedRequestToUpdateExpenseDetails = (event: APIGatewayProxyEvent, logger: LoggerBase) => {
  const req: ApiResourceExpense | null = utils.getJsonObj(event.body as string);
  logger.info("request =", req);

  if (!req) {
    throw new ValidationError([{ path: ExpenseRequestResourcePath.REQUEST, message: ErrorMessage.MISSING_VALUE }]);
  }

  const invalidFields: InvalidField[] = [];
  if (req.status && req.status !== ExpenseStatus.ENABLE) {
    invalidFields.push({ path: ExpenseRequestResourcePath.STATUS, message: ErrorMessage.INCORRECT_VALUE });
  }
  if (!fieldValidator.isValidBillName(req.billName)) {
    const msg = req.billName ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: ExpenseRequestResourcePath.BILLNAME, message: msg });
  }
  if (!fieldValidator.isValidDescription(req.description)) {
    const msg = req.description ? ErrorMessage.INCORRECT_FORMAT : ErrorMessage.MISSING_VALUE;
    invalidFields.push({ path: ExpenseRequestResourcePath.DESCRIPTION, message: msg });
  }
  if (!fieldValidator.isValidExpenseId(req.id)) {
    invalidFields.push({ path: ExpenseRequestResourcePath.ID, message: ErrorMessage.INCORRECT_FORMAT });
  }
  if (req.verifiedTimestamp && !fieldValidator.isValidVerifiedTimestamp(req.verifiedTimestamp, logger)) {
    invalidFields.push({ path: ExpenseRequestResourcePath.VERIFIED_TIMESTAMP, message: ErrorMessage.INCORRECT_FORMAT });
  }

  req.receipts = req.receipts || [];
  if (!receiptValidator.areValidReceipts(req.receipts, req.id, logger)) {
    invalidFields.push({ path: ExpenseRequestResourcePath.RECEIPTS, message: ErrorMessage.INCORRECT_VALUE });
  }

  fieldValidator.validateTags(req.tags, invalidFields, logger);

  logger.info("invalidFields =", invalidFields);
  if (invalidFields.length > 0) {
    throw new ValidationError(invalidFields);
  }

  return req;
};
