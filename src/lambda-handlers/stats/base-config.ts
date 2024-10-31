import { ExpenseBelongsTo } from "../expenses/base-config";
import { dateutil, getLogger, LoggerBase } from "../utils";
import {
  DbItemProjectedConfigType,
  DbItemProjectedIncome,
  DbItemProjectedPurchase,
  DbItemProjectedPymtAcc,
  DbItemProjectedRefund,
} from "./db-config";
import {
  ApiMonthlyStatResource,
  ApiResourceStatisticsBase,
  ApiResourceStatisticsConfigType,
  ApiResourceStatisticsPymtAcc,
  ApiResourceStatisticsTag,
} from "./resource-type";

export type _ApiMonthlyStatResource = Omit<ApiMonthlyStatResource, "total" | "monthName"> & { total: number };

type DbItemProjectedExpense = DbItemProjectedPurchase | DbItemProjectedIncome | DbItemProjectedRefund;

export const groupDetailsMonthly = <T extends DbItemProjectedExpense>(dbExpnsList: T[], _logger: LoggerBase) => {
  const logger = getLogger("groupDetailsMonthly", _logger);

  const monthlyMap: Record<string, T[]> = {};
  for (let i = 1; i <= 12; i++) {
    monthlyMap[i.toString().padStart(2, "0")] = [];
  }

  logger.debug("dbExpnsList.length =", dbExpnsList.length);
  dbExpnsList.forEach((dbExpns) => {
    let date: string;
    if (dbExpns.details.belongsTo === ExpenseBelongsTo.Purchase) {
      date = dbExpns.details.purchaseDate;
    } else if (dbExpns.details.belongsTo === ExpenseBelongsTo.Refund) {
      date = dbExpns.details.refundDate;
    } else {
      date = dbExpns.details.incomeDate;
    }
    logger.debug("expenseDate = ", date, " for belongsTo =", dbExpns.details.belongsTo, " dbExpense =", dbExpns);
    const key = dateutil.parseTimestamp(date).getMonth().toString().padStart(2, "0");
    logger.debug("month id key =", key, " adding dbExpense to group map list.");
    monthlyMap[key].push(dbExpns);
  });

  return monthlyMap;
};

export const getApiStatsResourceDetails = (groupedMap: Record<string, DbItemProjectedExpense[]>, year: number, _logger: LoggerBase) => {
  const logger = getLogger("getApiStatsResourceDetails", _logger);

  let totalCount = 0,
    totalAmount = 0;

  const monthIdKeys = Object.keys(groupedMap);
  const monthlyTotal: ApiMonthlyStatResource[] = monthIdKeys.map((k) => {
    const xpnsForMonth = groupedMap[k];
    const monthlyTotalAmount = xpnsForMonth
      .map((p) => p.details.amount)
      .filter((amt) => amt !== undefined)
      .reduce((prev, curr) => prev + Number(curr), 0);

    totalAmount += monthlyTotalAmount;
    totalCount += xpnsForMonth.length;
    const month = Number(k);

    return {
      total: monthlyTotalAmount.toFixed(2),
      count: xpnsForMonth.length,
      monthNo: month + 1,
      monthName: getMonthName(year, month),
    };
  });

  const apiResource: ApiResourceStatisticsBase = {
    count: totalCount,
    description: "statistics for year " + year,
    total: totalAmount.toFixed(2),
    monthlyTotal: monthlyTotal,
  };

  return apiResource;
};

export const getApiStatsResourceByConfigType = <T extends DbItemProjectedExpense>(
  groupedMap: Record<string, T[]>,
  configTypeDetailList: DbItemProjectedConfigType[],
  year: number,
  getPropValue: (dtl: any) => string[],
  _logger: LoggerBase
) => {
  const configTypeDetailMap = configTypeDetailList.reduce((prev: Record<string, DbItemProjectedConfigType>, curr) => {
    prev[curr.details.id] = curr;
    return prev;
  }, {});

  type ConfigTypeStatDetails = {
    totalCount: number;
    totalAmount: number;
    monthlyData: Record<string, _ApiMonthlyStatResource>;
  };
  const configTypeStatDetailMapById: Record<string, ConfigTypeStatDetails> = {};

  const monthIdKeys = Object.keys(groupedMap);
  monthIdKeys.forEach((monthKey) => {
    groupedMap[monthKey].forEach((xpnsDtl) => {
      getPropValue(xpnsDtl).forEach((configId) => {
        if (!configTypeStatDetailMapById[configId]) {
          configTypeStatDetailMapById[configId] = {
            totalAmount: 0,
            totalCount: 0,
            monthlyData: {},
          };
        }

        const amount = xpnsDtl.details.amount ? Number(xpnsDtl.details.amount) : 0;
        const configTypeStatDtl = configTypeStatDetailMapById[configId];
        configTypeStatDtl.totalAmount += amount;
        configTypeStatDtl.totalCount++;

        if (!configTypeStatDtl.monthlyData[monthKey]) {
          configTypeStatDtl.monthlyData[monthKey] = {
            count: 0,
            total: 0,
            monthNo: Number(monthKey),
          };
        }
        const monthlyStat = configTypeStatDtl.monthlyData[monthKey];
        monthlyStat.total += amount;
        monthlyStat.count++;
      });
    });
  });

  return Object.values(configTypeDetailMap).map((configTypeDetail) => {
    const confStats = configTypeStatDetailMapById[configTypeDetail.details.id];
    const confMonthlyData = Object.values(confStats.monthlyData).map((monthlyData) => {
      const resp: ApiMonthlyStatResource = {
        total: monthlyData.total.toFixed(2),
        count: monthlyData.count,
        monthNo: monthlyData.monthNo + 1,
        monthName: getMonthName(year, monthlyData.monthNo),
      };
      return resp;
    });
    const response: ApiResourceStatisticsConfigType = {
      id: configTypeDetail.details.id,
      name: configTypeDetail.details.name,
      value: configTypeDetail.details.value,
      count: confStats.totalCount,
      total: confStats.totalAmount.toFixed(2),
      description: "stats for year [" + year + "] and config name [" + configTypeDetail.details.name + "]",
      status: configTypeDetail.details.status,
      monthlyTotal: confMonthlyData,
    };
    return response;
  });
};

export const getApiStatsResourceByTags = (groupedMap: Record<string, DbItemProjectedExpense[]>, year: number, _logger: LoggerBase) => {
  type TagStatDetails = {
    tag: string;
    totalCount: number;
    totalAmount: number;
    monthlyData: Record<string, _ApiMonthlyStatResource>;
  };
  const tagStatMap: Record<string, TagStatDetails> = {};

  const monthIdKeys = Object.keys(groupedMap);
  monthIdKeys.forEach((monthKey) => {
    groupedMap[monthKey].forEach((purchaseDtl) => {
      [...new Set(purchaseDtl.details.tags)].forEach((tag) => {
        if (!(tag in tagStatMap)) {
          tagStatMap[tag] = {
            monthlyData: {},
            tag: tag,
            totalAmount: 0,
            totalCount: 0,
          };
        }
        const tagStatDtl = tagStatMap[tag];

        const amount = purchaseDtl.details.amount ? Number(purchaseDtl.details.amount) : 0;
        tagStatDtl.totalCount++;
        tagStatDtl.totalAmount += amount;

        if (!tagStatDtl.monthlyData[monthKey]) {
          tagStatDtl.monthlyData[monthKey] = {
            total: 0,
            count: 0,
            monthNo: Number(monthKey),
          };
        }
        const monthlyTagStat = tagStatDtl.monthlyData[monthKey];

        monthlyTagStat.count++;
        monthlyTagStat.total += amount;
      });
    });
  });

  return Object.values(tagStatMap).map((tagStatDetail) => {
    const tagMonthlyData = Object.values(tagStatDetail.monthlyData).map((monthlyData) => {
      const resp: ApiMonthlyStatResource = {
        total: monthlyData.total.toFixed(2),
        count: monthlyData.count,
        monthNo: monthlyData.monthNo + 1,
        monthName: getMonthName(year, monthlyData.monthNo),
      };
      return resp;
    });
    const response: ApiResourceStatisticsTag = {
      tag: tagStatDetail.tag,
      count: tagStatDetail.totalCount,
      total: tagStatDetail.totalAmount.toFixed(2),
      description: "stats for year [" + year + "] and tag [" + tagStatDetail.tag + "]",
      monthlyTotal: tagMonthlyData,
    };
    return response;
  });
};

export const getApiStatsResourceByTypeTags = (
  statsByType: ApiResourceStatisticsConfigType[],
  purchaseTypeDetailList: DbItemProjectedConfigType[],
  year: number,
  _logger: LoggerBase
) => {
  type TagStatDetails = {
    configType: DbItemProjectedConfigType;
    tag: string;
    totalCount: number;
    totalAmount: number;
    monthlyData: Record<string, _ApiMonthlyStatResource>;
  };

  const prchTypMapById = purchaseTypeDetailList.reduce((prev: Record<string, DbItemProjectedConfigType>, curr: DbItemProjectedConfigType) => {
    prev[curr.details.id] = curr;
    return prev;
  }, {});

  const purchaseTypeStatDetailMapByTag: Record<string, TagStatDetails> = {};

  statsByType.forEach((statDtl) => {
    const prchTyp = prchTypMapById[statDtl.id];
    prchTyp.details.tags.forEach((tag) => {
      if (!purchaseTypeStatDetailMapByTag[tag]) {
        purchaseTypeStatDetailMapByTag[tag] = {
          configType: prchTyp,
          totalAmount: 0,
          totalCount: 0,
          monthlyData: {},
          tag: tag,
        };
      } else {
        const tagStatMap = purchaseTypeStatDetailMapByTag[tag];
        tagStatMap.totalAmount += Number(statDtl.total);
        tagStatMap.totalCount += statDtl.count;
        statDtl.monthlyTotal.forEach((monthly) => {
          if (!tagStatMap.monthlyData[monthly.monthNo]) {
            tagStatMap.monthlyData[monthly.monthNo] = { ...monthly, total: 0, count: 0 };
          }
          tagStatMap.monthlyData[monthly.monthNo].total += Number(monthly.total);
          tagStatMap.monthlyData[monthly.monthNo].count += monthly.count;
        });
      }
    });
  });

  return Object.values(purchaseTypeStatDetailMapByTag).map((purchaseTypeTagStat) => {
    const purchaseTypeTagMonthlyData = Object.values(purchaseTypeTagStat.monthlyData).map((typeMonthlyData) => {
      const response: ApiMonthlyStatResource = {
        total: typeMonthlyData.total.toFixed(2),
        count: typeMonthlyData.count,
        monthNo: typeMonthlyData.monthNo,
        monthName: getMonthName(year, typeMonthlyData.monthNo - 1),
      };
      return response;
    });
    const response: ApiResourceStatisticsTag = {
      tag: purchaseTypeTagStat.tag,
      count: purchaseTypeTagStat.totalCount,
      total: purchaseTypeTagStat.totalAmount.toFixed(2),
      description: "stats for year [" + year + "] and purchaseType tag [" + purchaseTypeTagStat.tag + "]",
      monthlyTotal: purchaseTypeTagMonthlyData,
    };
    return response;
  });
};

export const getApiStatsResourceByPymtAcc = <T extends DbItemProjectedExpense>(
  groupedMap: Record<string, T[]>,
  pymtAccDetailList: DbItemProjectedPymtAcc[],
  year: number,
  _logger: LoggerBase
) => {
  const logger = getLogger("getApiStatsResourceByPymtAcc", _logger);
  const pymtAccMapById = pymtAccDetailList.reduce((prev: Record<string, DbItemProjectedPymtAcc>, curr) => {
    prev[curr.details.id] = curr;
    return prev;
  }, {});

  type PymtAccStatDetails = {
    pymtAcc: DbItemProjectedPymtAcc;
    totalCount: number;
    totalAmount: number;
    monthlyData: Record<string, _ApiMonthlyStatResource>;
  };
  const pymtAccStatDetailMapById: Record<string, PymtAccStatDetails> = {};

  const monthIdKeys = Object.keys(groupedMap);
  monthIdKeys.forEach((monthKey) => {
    groupedMap[monthKey].forEach((xpnsDtl) => {
      if (xpnsDtl.details.paymentAccountId) {
        if (!pymtAccStatDetailMapById[xpnsDtl.details.paymentAccountId]) {
          pymtAccStatDetailMapById[xpnsDtl.details.paymentAccountId] = {
            pymtAcc: pymtAccMapById[xpnsDtl.details.paymentAccountId],
            totalAmount: 0,
            totalCount: 0,
            monthlyData: {},
          };
        }

        const amount = xpnsDtl.details.amount ? Number(xpnsDtl.details.amount) : 0;
        const pymtAccStatDtl = pymtAccStatDetailMapById[xpnsDtl.details.paymentAccountId];
        pymtAccStatDtl.totalAmount += amount;
        pymtAccStatDtl.totalCount++;

        if (!pymtAccStatDtl.monthlyData[monthKey]) {
          pymtAccStatDtl.monthlyData[monthKey] = {
            count: 0,
            total: 0,
            monthNo: Number(monthKey),
          };
        }
        const monthlyStat = pymtAccStatDtl.monthlyData[monthKey];
        monthlyStat.total += amount;
        monthlyStat.count++;
      }
    });
  });

  return Object.values(pymtAccStatDetailMapById).map((statDetail) => {
    const pymtAccMonthlyData = Object.values(statDetail.monthlyData).map((monthlyData) => {
      const resp: ApiMonthlyStatResource = {
        total: monthlyData.total.toFixed(2),
        count: monthlyData.count,
        monthNo: monthlyData.monthNo + 1,
        monthName: getMonthName(year, monthlyData.monthNo),
      };
      return resp;
    });
    const response: ApiResourceStatisticsPymtAcc = {
      id: statDetail.pymtAcc.details.id,
      shortName: statDetail.pymtAcc.details.shortName,
      count: statDetail.totalCount,
      total: statDetail.totalAmount.toFixed(2),
      description: "stats for year [" + year + "] and config name [" + statDetail.pymtAcc.details.shortName + "]",
      status: statDetail.pymtAcc.details.status,
      monthlyTotal: pymtAccMonthlyData,
    };
    return response;
  });
};

/**
 *
 * @param year
 * @param month Jan is 0, Dec 11
 * @returns
 */
export const getMonthName = (year: number, month: number) => {
  return new Date(year, month, 1).toLocaleString("default", { month: "long" });
};
