import { Delete, DynamoDBClient, ProvisionedThroughputExceededException, Put, Update } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommandInput,
  DynamoDBDocument,
  TranslateConfig,
  QueryCommandInput,
  QueryCommandOutput,
  TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { LoggerBase, getLogger } from "../utils";
import { scheduler } from "node:timers/promises";
import { StopWatch } from "stopwatch-node";
import { JSONObject } from "../apigateway";

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
  const stopwatch = new StopWatch("batchAddUpdate");
  const logger = getLogger("batchAddUpdate", loggerBase);
  try {
    const MaxAllowedItems = 25;

    stopwatch.start();
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
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

const batchWriteWithRetry = async (batchWriteItemsInput: BatchWriteCommandInput, logger: LoggerBase, retryAttempt?: number) => {
  retryAttempt = retryAttempt === undefined ? 3 : retryAttempt;
  const stopwatch = new StopWatch("batchWriteWithRetry" + retryAttempt);
  stopwatch.start();
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
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
  return results;
};

export async function queryAll<T>(baseLogger: LoggerBase, input: QueryCommandInput): Promise<T[]> {
  const stopwatch = new StopWatch("queryAll");
  const logger = getLogger("queryAll", baseLogger);
  const qsw = new StopWatch("queryloop");
  try {
    stopwatch.start();
    let output: QueryCommandOutput;
    let lastEvaluatedKey = undefined;
    const items = [];
    let count = 1;
    logger.info("starting to query DB in loop until all items are retireved satisfying input command");
    do {
      try {
        qsw.start("iteration" + count);
        const cmdInput: QueryCommandInput = { ...input, ExclusiveStartKey: lastEvaluatedKey };
        logger.info("cmdInput =", cmdInput);
        output = await ddbClient.query(cmdInput);
        lastEvaluatedKey = output.LastEvaluatedKey;
        items.push(...(output.Items || []));
        logger.info(
          "retrived db result count =",
          output.Count,
          ", total item count = ",
          items.length,
          ", output =",
          { ...output, Items: null },
          ", lastEvaluatedKey =",
          lastEvaluatedKey
        );
        count++;
      } finally {
        qsw.stop();
        logger.info("stopwatch summary", qsw.shortSummary());
      }
    } while (lastEvaluatedKey);

    return items as T[];
  } finally {
    stopwatch.stop();
    logger.info("queryloop summary");
    qsw.prettyPrint();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
}

export type TransactionPutItem = Omit<Put, "Item" | "ExpressionAttributeValues"> & {
  Item: Record<string, NativeAttributeValue> | undefined;
  ExpressionAttributeValues?: Record<string, NativeAttributeValue>;
};

export type TransactionUpdateItem = Omit<Update, "Key" | "ExpressionAttributeValues"> & {
  Key: Record<string, NativeAttributeValue> | undefined;
  ExpressionAttributeValues?: Record<string, NativeAttributeValue>;
};

export type TransactionDeleteItem = Omit<Delete, "Key" | "ExpressionAttributeValues"> & {
  Key: Record<string, NativeAttributeValue> | undefined;
  ExpressionAttributeValues?: Record<string, NativeAttributeValue>;
};

type TransactionItem = {
  Put?: TransactionPutItem;
  Delete?: TransactionDeleteItem;
  Update?: TransactionUpdateItem;
};

export class TransactionWriter {
  private items: TransactionItem[];
  private logger: LoggerBase;

  constructor(logger: LoggerBase) {
    this.items = [];
    this.logger = logger;
  }

  /**
   * writeItems
   */
  public writeItems(input: TransactWriteCommandInput, _logger?: LoggerBase) {
    const logger = getLogger("writeItems", _logger || this.logger);
    const transactions = input.TransactItems as TransactionItem[];
    this.items.push(...transactions);
    logger.info("items has been scheduled for transaction", "size of scheduled items", this.items.length);
    return this;
  }

  /**
   * putItems
   */
  public putItems(putItems: TransactionPutItem | TransactionPutItem[] | JSONObject | JSONObject[], tableName?: string, _logger?: LoggerBase) {
    const logger = getLogger("putItems", _logger || this.logger);
    const itemsPut = Array.isArray(putItems) ? putItems : [putItems];
    itemsPut
      .map((it) => {
        if (it.TableName && it.Item) {
          return it as TransactionPutItem;
        }
        if (!tableName) {
          throw new Error("unknown tableName in putItem for transaction");
        }
        const item: TransactionPutItem = {
          Item: it,
          TableName: tableName,
        };
        return item;
      })
      .forEach((it) => this.items.push({ Put: it }));

    logger.info("put items has been scheduled for transaction", "size of scheduled items", this.items.length);
    return this;
  }

  /**
   * deleteItems
   */
  public deleteItems(deleteItems: TransactionDeleteItem | TransactionDeleteItem[], _logger?: LoggerBase) {
    const logger = getLogger("deleteItems", _logger || this.logger);
    const itemsDelete = Array.isArray(deleteItems) ? deleteItems : [deleteItems];
    itemsDelete.map((it) => this.items.push({ Delete: it }));
    logger.info("delete items has been scheduled for transaction", "size of scheduled items", this.items.length);
    return this;
  }

  /**
   * updateItems
   */
  public updateItems(updateItems: TransactionUpdateItem | TransactionUpdateItem[], _logger?: LoggerBase) {
    const logger = getLogger("updateItems", _logger || this.logger);
    const itemsUpdate = Array.isArray(updateItems) ? updateItems : [updateItems];
    itemsUpdate.map((it) => this.items.push({ Update: it }));
    logger.info("update items has been scheduled for transaction", "size of scheduled items", this.items.length);
    return this;
  }

  /**
   * execute
   */
  public async executeTransaction() {
    const sw = new StopWatch("executeTransaction");
    const logger = getLogger("executeTransaction", this.logger);
    try {
      sw.start();
      if (this.items.length === 0) return;
      logger.info("scheduled", this.items.length, "items are getting written in a transaction");

      const transactWriteResult = await ddbClient.transactWrite({
        TransactItems: this.items,
      });
      logger.info("transactWriteResult =", transactWriteResult);
    } finally {
      sw.stop();
      logger.info("stopwatch summary: ", sw.shortSummary());
    }
  }
}
