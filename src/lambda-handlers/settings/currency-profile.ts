import { caching } from "cache-manager";
import { LoggerBase, getLogger, s3utils } from "../utils";
import { _logger } from "./base-config";
import { _configDataBucketName, BelongsTo } from "../config-type";

const CurrencyProfileMemoryCache = caching("memory", {
  max: 3,
  ttl: 25 * 60 * 1000,
});

export interface CountryDetail {
  name: string;
  code: string;
}

export interface CurrencyDetail {
  name: string;
  code: string;
  symbol: string;
}

export interface CodeRelation {
  countryCode: string;
  currencyCode: string;
}

export interface CurrencyProfile {
  countries: CountryDetail[];
  currencies: CurrencyDetail[];
  relations: CodeRelation[];
}

export interface CountryCurrencyRelation {
  country: CountryDetail;
  currency: CurrencyDetail;
}

const getAllowedCurrencyProfiles = async (baseLogger: LoggerBase) => {
  const profileCache = await CurrencyProfileMemoryCache;
  const profilesPromise = profileCache.wrap("allowedProfiles", async () => {
    const logger = getLogger("getAllowedCurrencyProfiles", baseLogger);

    const currencyProfiles = await s3utils.getJsonObjectFromS3<CurrencyProfile>(_configDataBucketName, `${BelongsTo.CurrencyProfile}.json`, logger);
    logger.info(
      "number of countries =",
      currencyProfiles?.countries.length,
      ", number of currencies =",
      currencyProfiles?.currencies.length,
      ", number of code relations =",
      currencyProfiles?.relations.length
    );

    // validate
    const validCountries = currencyProfiles?.countries.filter((c) => c.code && c.name).map((c) => ({ name: c.name, code: c.code }));
    logger.info("validCountries.length =", validCountries?.length);
    const validCurrencies = currencyProfiles?.currencies
      .filter((c) => c.code && c.name && c.symbol)
      .map((c) => ({ name: c.name, code: c.code, symbol: c.symbol }));
    logger.info("validCurrencies.length =", validCurrencies?.length);

    const result: CurrencyProfile = {
      countries: validCountries || [],
      currencies: validCurrencies || [],
      relations: [],
    };
    // remove invalid relations
    currencyProfiles?.relations.forEach((r) => {
      const isCountryCodeValid = result.countries.map((c) => c.code).includes(r.countryCode);
      const isCurrencyCodeValid = result.currencies.map((c) => c.code).includes(r.currencyCode);

      if (isCountryCodeValid && isCurrencyCodeValid) {
        result.relations.push({
          countryCode: r.countryCode,
          currencyCode: r.currencyCode,
        });
      }
    });
    logger.info("validRelations.length =", result.relations.length);

    return result;
  });

  return await profilesPromise;
};

export const getAllCountries = async (baseLogger: LoggerBase) => {
  const logger = getLogger("getAllCountries", baseLogger);
  const currencyProfiles = await getAllowedCurrencyProfiles(baseLogger);

  const countries = currencyProfiles.countries;
  logger.info("countries =", countries);
  return countries;
};

export const getAllCurrencies = async (baseLogger: LoggerBase) => {
  const logger = getLogger("getAllCurrencies", baseLogger);
  const currencyProfiles = await getAllowedCurrencyProfiles(baseLogger);

  const currencies = currencyProfiles.currencies;
  logger.info("currencies =", currencies);
  return currencies;
};

export const getCurrencyByCountry = async (baseLogger: LoggerBase) => {
  const logger = getLogger("getCurrencyByCountry", baseLogger);
  const currencyProfiles = await getAllowedCurrencyProfiles(baseLogger);

  const currencies = currencyProfiles.relations
    .map((codeRelation) => {
      const matchingCountry = currencyProfiles.countries.find((c) => codeRelation.countryCode === c.code);
      const matchingCurrency = currencyProfiles.currencies.find((c) => codeRelation.currencyCode === c.code);
      if (matchingCountry && matchingCurrency) {
        const ccr: CountryCurrencyRelation = {
          country: { ...matchingCountry },
          currency: { ...matchingCurrency },
        };
        return ccr;
      }
      return null;
    })
    .filter((r) => r !== null);

  logger.info("currencies =", currencies);
  return currencies as CountryCurrencyRelation[];
};
