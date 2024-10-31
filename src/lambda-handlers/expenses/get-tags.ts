import { getLogger, dbutil, LoggerBase, dateutil } from "../utils";
import { AuthorizeUser, getAuthorizeUser } from "../user";
import { ExpenseBelongsTo, ExpenseStatus } from "./base-config";
import {
  DbItemExpense,
  DbTagsType,
  ExpenseTableName,
  getGsiAttrDetailsBelongsTo,
  getGsiPkExpenseTags,
  getGsiSkDetailsExpenseDate,
  UserIdStatusIndex,
} from "./db-config";
import { apiGatewayHandlerWrapper } from "../apigateway";
import { APIGatewayProxyEvent } from "aws-lambda";
import { getValidatedBelongsToPathParam, getValidatedExpenseYearQueryParam } from "./api-resource";

const rootLogger = getLogger("expense.get-tag-list");

export const getExpenseTagList = apiGatewayHandlerWrapper(async (event: APIGatewayProxyEvent) => {
  const logger = getLogger("handler", rootLogger);

  const yearsParam = getValidatedExpenseYearQueryParam(event, logger);
  const belongsToParam = getValidatedBelongsToPathParam(event, logger);

  const authUser = getAuthorizeUser(event);

  const tagList = await getExpenseTags(yearsParam, belongsToParam, authUser, logger);

  return tagList;
});

/**
 * DynamoDB code example
 * https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html
 */
const getExpenseTags = async (years: number[], belongsTo: ExpenseBelongsTo, authUser: AuthorizeUser, _logger: LoggerBase) => {
  const logger = getLogger("getExpenseTags", _logger);

  /**
   * [2020,2018].sort()
   *  >>  [{s:2018,e:2018},{s:2020,e:2020}]
   *
   * [2016,2015,2018].sort()
   *  >>  [{s:2015,e:2016},{s:2018,e:2018}]
   *
   * [2023].sort()
   *  >>  [{s:2023,e:2023}]
   *
   * [2019,2020,2018].sort()
   *  >>  [{s:2018,e:2020}]
   *
   */
  type RangeYearType = Record<"startYear" | "endYear", number>;
  const rangeYears: RangeYearType[] = [];

  const yearsSet = new Set(years);
  const sortedRangeYears = [...yearsSet].sort().reduce((accry, curr) => {
    const popry = accry.pop();
    let newry: RangeYearType | undefined = undefined;

    if (popry === undefined) {
      newry = {
        startYear: curr,
        endYear: curr,
      };
    } else {
      if (curr > popry.startYear && curr - 1 === popry.endYear) {
        popry.endYear = curr;
      } else {
        newry = {
          startYear: curr,
          endYear: curr,
        };
      }
    }
    if (popry) {
      accry.push(popry);
    }
    if (newry) {
      accry.push(newry);
    }

    return accry;
  }, rangeYears);

  const tagsPromises = sortedRangeYears.map((range) => queryExpenseTags(range.startYear, range.endYear, belongsTo, authUser.userId, logger));

  const tagsListOfList = await Promise.all(tagsPromises);

  const tagSet = new Set<string>(tagsListOfList.flat());

  logger.info("retrieved unique tag size =", tagSet.size);
  return [...tagSet];
};

const queryExpenseTags = async (startYear: number, endYear: number, belongsTo: ExpenseBelongsTo, userId: string, _logger: LoggerBase) => {
  const logger = getLogger("queryExpenseTags", _logger);
  const searchStartDate = dateutil.parseTimestamp("01-01-" + startYear, "MM-DD-YYYY", logger);
  const searchEndDate = dateutil.parseTimestamp("12-31-" + endYear, "MM-DD-YYYY", logger);

  const promises = [ExpenseStatus.ENABLE, ExpenseStatus.DISABLE].map(async (status) => {
    const dbItemTags = await dbutil.queryAll<DbItemExpense<null>>(logger, {
      TableName: ExpenseTableName,
      IndexName: UserIdStatusIndex,
      KeyConditionExpression: "US_GSI_PK = :gpkv and US_GSI_SK BETWEEN :gskv1 and :gskv2",
      FilterExpression: "US_GSI_BELONGSTO = :gbtv",
      ExpressionAttributeValues: {
        ":gpkv": getGsiPkExpenseTags(userId, status, belongsTo, logger),
        ":gskv1": getGsiSkDetailsExpenseDate(searchStartDate, logger),
        ":gskv2": getGsiSkDetailsExpenseDate(searchEndDate, logger),
        ":gbtv": getGsiAttrDetailsBelongsTo(belongsTo, logger),
      },
    });

    logger.info("retrieved [", dbItemTags.length, "] expense tags with status =", status, ", startYear =", startYear, ", endYear =", endYear);
    return dbItemTags.map((itemTag) => itemTag.PK);
  });

  const listOfKeyList = await Promise.all(promises);
  const dbKeys = listOfKeyList.flat().map((k) => ({ PK: k }));
  const projectExpression = "details.tags";
  const items = await dbutil.batchGet<DbItemExpense<DbTagsType>>(dbKeys, ExpenseTableName, { ProjectionExpression: projectExpression }, logger);
  return items.flatMap((itm) => itm.details.tags);
};
