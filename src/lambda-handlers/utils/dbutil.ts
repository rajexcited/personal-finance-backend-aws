import { Delete, DynamoDBClient, ProvisionedThroughputExceededException, Put, ReturnValue, Update } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommandInput,
  DynamoDBDocument,
  TranslateConfig,
  QueryCommandInput,
  QueryCommandOutput,
  TransactWriteCommandInput,
  GetCommandInput,
  PutCommandInput,
  DeleteCommandInput,
  UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { LoggerBase, getLogger } from "../utils";
import { scheduler } from "node:timers/promises";
import { StopWatch } from "stopwatch-node";
import { JSONObject } from "../apigateway";
import { MissingError } from "../apigateway";
import { caching } from "cache-manager";

const getItemMemoryCache = caching("memory", {
  max: 25,
  // ttl in seconds
  ttl: 60 * 1000,
});

const DdbTranslateConfig: TranslateConfig = {
  marshallOptions: {
    convertClassInstanceToMap: true,
    convertEmptyValues: false,
    convertTopLevelContainer: true,
    removeUndefinedValues: true,
  },
};

const ddbClient = DynamoDBDocument.from(new DynamoDBClient(), DdbTranslateConfig);

export const getItem = async (input: GetCommandInput, _logger: LoggerBase) => {
  const stopwatch = new StopWatch("getItem");
  const logger = getLogger("getItem", _logger);
  try {
    stopwatch.start();
    logger.info("getting results from cache if available", "input =", input);
    const cache = await getItemMemoryCache;
    const outputPromise = cache.wrap(JSON.stringify(input), async () => {
      logger.info("calling db api call");
      const dbOutput = await ddbClient.get(input);
      return dbOutput;
    });

    logger.info("output =", await outputPromise);
    return await outputPromise;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const putItem = async (input: PutCommandInput, _logger: LoggerBase) => {
  const stopwatch = new StopWatch("putItem");
  const logger = getLogger("putItem", _logger);
  try {
    stopwatch.start();
    logger.info("input =", input);

    const output = await ddbClient.put(input);
    logger.info("output =", output);
    return output;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const updateAttribute = async (input: UpdateCommandInput, _logger: LoggerBase) => {
  const stopwatch = new StopWatch("updateAttribute");
  const logger = getLogger("updateAttribute", _logger);
  try {
    stopwatch.start();
    const modifiedInput: UpdateCommandInput = { ReturnValues: ReturnValue.ALL_OLD, ...input };
    logger.info("input =", input);

    const output = await ddbClient.update(modifiedInput);
    logger.info("output =", output);
    return output;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const deleteItem = async (input: DeleteCommandInput, _logger: LoggerBase) => {
  const stopwatch = new StopWatch("deleteItem");
  const logger = getLogger("deleteItem", _logger);
  try {
    stopwatch.start();
    logger.info("input =", input);

    const output = await ddbClient.delete(input);
    logger.info("output =", output);
    return output;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const queryOnce = async (input: QueryCommandInput, _logger: LoggerBase) => {
  const stopwatch = new StopWatch("queryOnce");
  const logger = getLogger("queryOnce", _logger);
  try {
    stopwatch.start();
    logger.info("input =", input);

    const output = await ddbClient.query(input);
    logger.info("output =", output);
    return output;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const batchGet = async <T>(itemsKeys: Record<string, NativeAttributeValue>[], tableName: string, loggerBase: LoggerBase) => {
  const stopwatch = new StopWatch("batchGet");
  const logger = getLogger("batchGet", loggerBase);
  const counter = 1;
  const itemResponse: T[] = [];
  try {
    let itemsToGet: Record<string, NativeAttributeValue>[] = [...itemsKeys];

    while (itemsToGet.length > 0) {
      stopwatch.start("iteration-" + counter);
      try {
        const requestItems: Record<string, { Keys: Record<string, NativeAttributeValue>[] }> = {};
        requestItems[tableName] = { Keys: [...itemsToGet] };
        logger.debug("requesting [", itemsToGet.length, "] items, requestItems =", requestItems);

        const output = await ddbClient.batchGet({ RequestItems: requestItems });
        const items = (output.Responses && output.Responses[tableName]) || [];
        logger.info("retrieved items, output =", output, ", size of list=", items.length);

        itemsToGet = (output.UnprocessedKeys && output.UnprocessedKeys[tableName] && output.UnprocessedKeys[tableName].Keys) || [];
        itemResponse.push(...(items as T[]));
      } catch (err) {
        logger.error("unable to complete batchget command.", err);

        if (err instanceof ProvisionedThroughputExceededException) {
          logger.info("re-attempting the batchget after 1 sec sleep");
          await scheduler.wait(1000);
          continue;
        }

        throw err;
      }
      stopwatch.stop();
    }
  } finally {
    if (stopwatch.isRunning()) stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
  return itemResponse;
};

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

export const queryAll = async <T>(baseLogger: LoggerBase, input: QueryCommandInput): Promise<T[]> => {
  const stopwatch = new StopWatch("queryAll");
  const logger = getLogger("queryAll", baseLogger);
  const qsw = new StopWatch("queryloop");
  try {
    stopwatch.start();
    if (!input.TableName) {
      throw new MissingError(`missing tableName [${input.TableName}]`);
    }
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
};

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
  public writeItems(input: TransactWriteCommandInput, baseLogger?: LoggerBase) {
    const logger = getLogger("writeItems", baseLogger || this.logger);
    const transactions = input.TransactItems as TransactionItem[];
    this.items.push(...transactions);
    logger.debug("scheduled writing transactions =", transactions);
    logger.info("items has been scheduled for transaction", "size of scheduled items", this.items.length);
    return this;
  }

  /**
   * putItems
   */
  public putItems(putItems: TransactionPutItem | TransactionPutItem[] | JSONObject | JSONObject[], tableName?: string, baseLogger?: LoggerBase) {
    const logger = getLogger("putItems", baseLogger || this.logger);
    const itemsPut = Array.isArray(putItems) ? putItems : [putItems];
    itemsPut
      .map((it) => {
        if (it.TableName && it.Item) {
          return it as TransactionPutItem;
        }
        if (!tableName && !it.TableName) {
          throw new Error("unknown tableName in putItem for transaction");
        }
        const item: TransactionPutItem = {
          Item: it,
          TableName: tableName || (it.TableName as string),
        };
        return item;
      })
      .forEach((it) => {
        const item: TransactionItem = { Put: it };
        logger.debug("scheduled putting item =", item);
        this.items.push(item);
      });

    logger.info("put items has been scheduled for transaction", "size of scheduled items", this.items.length);
    return this;
  }

  /**
   * deleteItems
   */
  public deleteItems(
    deleteItems: TransactionDeleteItem | TransactionDeleteItem[] | null,
    partitionKeys?: string | string[] | null,
    tableName?: string | null,
    baseLogger?: LoggerBase
  ) {
    const logger = getLogger("deleteItems", baseLogger || this.logger);
    let itemsDelete: TransactionDeleteItem[];
    if (deleteItems) {
      logger.debug("found deleteItems");
      itemsDelete = Array.isArray(deleteItems) ? deleteItems : [deleteItems];
    } else if (tableName && partitionKeys) {
      logger.debug("found tableName =", tableName, ", partitionKeys =", partitionKeys);
      const deletingPKs = Array.isArray(partitionKeys) ? partitionKeys : [partitionKeys];
      itemsDelete = deletingPKs.map((pkv) => ({
        Key: { PK: pkv },
        TableName: tableName,
      }));
    } else {
      logger.debug("none of partitionKeys and tableName Or deleteItems");
      throw new MissingError("incorrect arguments. partitionKeys and tableName not provided. Or deleteItems not provided");
    }
    itemsDelete.forEach((it) => {
      const item: TransactionItem = { Delete: it };
      logger.debug("scheduled deleting item =", item);
      this.items.push(item);
    });
    logger.info("delete items has been scheduled for transaction", "size of scheduled items", this.items.length);
    return this;
  }

  /**
   * updateItems
   */
  public updateItemAttributes(updateItems: TransactionUpdateItem | TransactionUpdateItem[], baseLogger?: LoggerBase) {
    const logger = getLogger("updateItems", baseLogger || this.logger);
    const itemsUpdate = Array.isArray(updateItems) ? updateItems : [updateItems];
    itemsUpdate.forEach((it) => {
      const item: TransactionItem = { Update: it };
      logger.debug("scheduled updating item =", item);
      this.items.push(item);
    });
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
