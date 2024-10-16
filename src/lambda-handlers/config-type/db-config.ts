import { caching } from "cache-manager";
import { InvalidError } from "../apigateway";
import { dbutil, getLogger, LoggerBase } from "../utils";
import { _belongsToGsiName, _configTypeTableName, BelongsTo, ConfigStatus, getBelongsToGsiPk, getBelongsToGsiSk } from "./base-config";
import { DbItemConfigType } from "./resource-type";
import ms from "ms";

const getConfigTypeDetailList = async (belongsTo: BelongsTo, status: ConfigStatus, userId: string, _logger: LoggerBase) => {
  const logger = getLogger("getConfigTypeList", _logger);

  const configItems = await dbutil.queryAll<DbItemConfigType>(logger, {
    TableName: _configTypeTableName,
    IndexName: _belongsToGsiName,
    KeyConditionExpression: "UB_GSI_PK = :pkv and UB_GSI_SK = :stv",
    ExpressionAttributeValues: {
      ":pkv": getBelongsToGsiPk(null, logger, userId, belongsTo),
      ":stv": getBelongsToGsiSk(status),
    },
  });

  logger.info("retrieved", configItems.length, "config types for status [", status, "] and belongsTo [" + belongsTo + "]");

  return configItems.map((item) => item.details);
};

const currencyProfileMemoryCache = caching("memory", {
  max: 5,
  ttl: ms("15 min"),
});

export const getDefaultCurrencyProfile = async (userId: string, _logger: LoggerBase) => {
  const currencyProfileCache = await currencyProfileMemoryCache;
  return currencyProfileCache.wrap(userId, async () => {
    const currencyConfigList = await getConfigTypeDetailList(BelongsTo.CurrencyProfile, ConfigStatus.ENABLE, userId, _logger);
    if (currencyConfigList.length !== 1) {
      throw new InvalidError("there must be 1 currency config details");
    }

    return currencyConfigList[0];
  });
};
