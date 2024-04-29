import { GetCommandInput } from "@aws-sdk/lib-dynamodb";
import { LoggerBase, dbutil, getLogger, validations } from "../utils";
import {
  ACCOUNT_ID_NUM_MAX_LENGTH,
  INSTITUTION_NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  _pymtAccTableName,
  getDetailsTablePk,
  getUserIdStatusShortnameGsiPk,
} from "./base-config";
import { DbItemPymtAcc } from "./resource-type";

export const isValidAccountIdNum = (accountIdNum: string | undefined | null) => {
  const validLength = validations.isValidLength(accountIdNum, NAME_MIN_LENGTH, ACCOUNT_ID_NUM_MAX_LENGTH);
  if (!validLength) return false;

  const accountIdNumRegex = new RegExp("^[\\w\\.,|\\+-]+$");
  return accountIdNumRegex.test(accountIdNum as string);
};

export const isValidInstitutionName = (institutionName: string | undefined | null) => {
  const validLength = validations.isValidLength(institutionName, NAME_MIN_LENGTH, INSTITUTION_NAME_MAX_LENGTH);
  if (!validLength) return false;

  const institutionNameRegex = new RegExp("^[\\w\\s\\.,\\?|#\\+-]+$");
  return institutionNameRegex.test(institutionName as string);
};

export const isValidPaymentAccount = async (paymentAccountId: string, userId: string, _logger: LoggerBase) => {
  const logger = getLogger("isValidPaymentAccount", _logger);
  const getCmdInput: GetCommandInput = {
    TableName: _pymtAccTableName,
    Key: { PK: getDetailsTablePk(paymentAccountId) },
  };
  const output = await dbutil.getItem(getCmdInput, logger);
  logger.info("retrieved payment account Item from DB");

  const item = output.Item as DbItemPymtAcc;
  if (!!item) {
    const gsiPk = getUserIdStatusShortnameGsiPk(userId);
    return item.UP_GSI_PK.startsWith(gsiPk);
  }
  return false;
};
