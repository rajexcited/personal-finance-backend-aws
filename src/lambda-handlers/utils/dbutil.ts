import { DynamoDBClient, ProvisionedThroughputExceededException } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommandInput, DynamoDBDocument, TranslateConfig } from "@aws-sdk/lib-dynamodb";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { LoggerBase, getLogger, utils } from "../utils";
import { scheduler } from "node:timers/promises";

const DdbTranslateConfig: TranslateConfig = {
  marshallOptions: {
    convertClassInstanceToMap: true,
    convertEmptyValues: false,
    convertTopLevelContainer: true,
    removeUndefinedValues: true,
  },
};

export const ddbClient = DynamoDBDocument.from(new DynamoDBClient(), DdbTranslateConfig);

export const batchAddUpdate = async (items: Record<string, NativeAttributeValue>[], tableName: string, loggerBase: LoggerBase) => {
  const logger = getLogger("batchAddUpdate", loggerBase);
  const MaxAllowedItems = 25;

  let startInd = 0,
    endInd = 0;

  while (endInd < items.length) {
    startInd = endInd;
    endInd = Math.min(items.length, endInd + MaxAllowedItems);
    const batchWriteItems = items.slice(startInd, endInd);
    const requestItems: any = {};
    requestItems[tableName] = batchWriteItems.map((item) => ({ PutRequest: { Item: item } }));
    const batchWriteResults = await batchWriteWithRetry({ RequestItems: requestItems }, logger);
    // batchWriteResults.UnprocessedItems
    logger.info("items.length", items.length, "startInd", startInd, "endInd", endInd, "batchWriteResults", batchWriteResults);
  }
};

const batchWriteWithRetry = async (batchWriteItemsInput: BatchWriteCommandInput, logger: LoggerBase, retryAttempt?: number) => {
  retryAttempt = retryAttempt === undefined ? 3 : retryAttempt;
  let results = null;
  try {
    logger.debug("before adding, batchWriteItemsInput=", batchWriteItemsInput);
    results = await ddbClient.batchWrite(batchWriteItemsInput);
    logger.debug("after batchwrite, results=", results);
  } catch (err) {
    const remainingRetryAttempt = retryAttempt - 1;
    logger.error("batchWrite failed. remaining retry attempt: " + remainingRetryAttempt, err);
    if (err instanceof ProvisionedThroughputExceededException && remainingRetryAttempt > 0) {
      await scheduler.wait(1000);
      results = await batchWriteWithRetry(batchWriteItemsInput, logger, remainingRetryAttempt);
    }
    throw err;
  }
  return results;
};
