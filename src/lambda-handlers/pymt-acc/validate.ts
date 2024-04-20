import { validations } from "../utils";
import { ACCOUNT_ID_NUM_MAX_LENGTH, INSTITUTION_NAME_MAX_LENGTH, NAME_MIN_LENGTH } from "./base-config";

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
