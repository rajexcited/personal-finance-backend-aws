import { JSONObject, NotFoundError } from "../apigateway";
import { BelongsTo, getConfigId } from "../config-type";
import { dbutil, getLogger, utils, validations } from "../utils";
import {
  NAME_MIN_LENGTH,
  PymtAccStatus,
  SHORTNAME_MAX_LENGTH,
  _logger,
  _pymtAccTableName,
  getDetailsTablePk,
  getUserIdStatusShortnameGsiPk,
  getUserIdStatusShortnameGsiSk,
} from "./base-config";
import { DbPaymentAccountDetails, DbItemPymtAcc, DefaultPaymentAccounts } from "./resource-type";
import { v4 as uuidv4 } from "uuid";
import { isValidAccountIdNum, isValidInstitutionName } from "./validate";
import { AuthorizeUser } from "../user";

export const createDetails = async (details: DefaultPaymentAccounts[], authUser: AuthorizeUser, transactionWriter: dbutil.TransactionWriter) => {
  const logger = getLogger("createDetails", _logger);
  logger.info("details", details);

  const invalidPymtAccData: DefaultPaymentAccounts[] = [];
  const invalidPymtAccPromises = details.map(async (item) => {
    if (!validations.isValidName(item.shortName, SHORTNAME_MAX_LENGTH, NAME_MIN_LENGTH)) return true;
    if (!validations.isValidDescription(item.description)) return true;
    if (!!item.accountIdNum && !isValidAccountIdNum(item.accountIdNum)) return true;
    if (!!item.institutionName && !isValidInstitutionName(item.institutionName)) return true;
    if (!validations.areTagsValid(item.tags)) return true;

    if (!validations.isValidUuid(item.typeName)) {
      const typeId = await getConfigId(item.typeName, authUser.userId, BelongsTo.PaymentAccountType, logger);
      if (!typeId) return true;
    }

    return false;
  });

  const filterResults = await Promise.all(invalidPymtAccPromises);
  filterResults.forEach((isInvalid, ind) => {
    if (isInvalid) invalidPymtAccData.push(details[ind]);
  });
  logger.info("invalidPymtAccData.length =", invalidPymtAccData.length, "filtered result =", filterResults);
  if (invalidPymtAccData.length > 0) {
    logger.warn("invalidPymtAccData =", invalidPymtAccData);
    throw new Error("invalid payment account data");
  }

  const auditDetails = utils.updateAuditDetailsFailIfNotExists(null, authUser);

  const invalidTypeNames: string[] = [];
  const itemPromises = details.map(async (detail) => {
    let typeId;
    if (validations.isValidUuid(detail.typeName)) {
      typeId = detail.typeName;
    } else {
      typeId = await getConfigId(detail.typeName, authUser.userId, BelongsTo.PaymentAccountType, logger);
    }

    const itemDetail: DbPaymentAccountDetails = {
      id: uuidv4(),
      shortName: detail.shortName,
      accountIdNum: detail.accountIdNum,
      description: detail.description,
      tags: detail.tags,
      typeId: typeId as string,
      institutionName: detail.institutionName,
      status: detail.status || PymtAccStatus.ENABLE,
      auditDetails: { ...auditDetails },
    };

    const item: DbItemPymtAcc = {
      PK: getDetailsTablePk(itemDetail.id),
      UP_GSI_PK: getUserIdStatusShortnameGsiPk(authUser.userId, itemDetail.status),
      UP_GSI_SK: getUserIdStatusShortnameGsiSk(itemDetail.shortName),
      details: itemDetail,
    };

    return item;
  });

  if (invalidTypeNames.length) {
    throw new NotFoundError(`invalid payment account types ${invalidTypeNames.join(", ")}`);
  }

  const items = (await Promise.all(itemPromises)) as DbItemPymtAcc[];
  transactionWriter.putItems(items as unknown as JSONObject[], _pymtAccTableName, logger);
  return items.map((item) => item.details);
};
