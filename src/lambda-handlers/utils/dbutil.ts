import {
  Delete,
  DynamoDBClient,
  KeysAndAttributes,
  ProvisionedThroughputExceededException,
  Put,
  ReturnValue,
  Update
} from "@aws-sdk/client-dynamodb";
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
  UpdateCommandInput
} from "@aws-sdk/lib-dynamodb";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import { LoggerBase, getLogger } from "../utils";
import { scheduler } from "node:timers/promises";
import { StopWatch } from "stopwatch-node";
import { JSONObject } from "../apigateway";
import { MissingError } from "../apigateway";
import { caching } from "cache-manager";
import ms from "ms";
import { isKeywordDynamoDbReserve } from "./dynamodb-config";

/*


### Error Handling Flow:

┌─────────────────────────────────────────────────────────────┐
│                     DynamoDB Error                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
              ┌───────▼───────────┐
              │ isServiceFailure? │
              └───────┬───────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             │             ▼
   ✅ YES             │            ❌ NO
 Service Failure      │        User/App Error
        │             │             │
        ▼             │             ▼
Circuit Breaker       │        Log Error
   onFailure()        │       Fail Fast
        │             │        No Circuit
        ▼             │       Breaker Impact
  May Trip Circuit    │             │
                      │             ▼
                      │      Return Error
                      │      to Caller
                      │
                      │
              ┌───────▼────────┐
              │  Retry Logic   │
              │ (if retryable) │
              └────────────────┘

*/

const getItemMemoryCache = caching("memory", {
  max: 25,
  ttl: ms("5 min")
});

export enum CacheAction {
  FROM_CACHE = "from-cache",
  NOT_FROM_CACHE = "not-from-cache",
  CLEAR_CACHE_AFTER_RESULT = "clear-cache-after-result",
  CLEAR_CACHE_NO_CALL = "clear-cache-only"
}

const DdbTranslateConfig: TranslateConfig = {
  marshallOptions: {
    convertClassInstanceToMap: true,
    convertEmptyValues: false,
    convertTopLevelContainer: true,
    removeUndefinedValues: true
  }
};

const ddbClient = DynamoDBDocument.from(new DynamoDBClient(), DdbTranslateConfig);

const MAX_RETRY_ATTEMPTS = 3; // Up to 3 retries for transient errors
const BASE_RETRY_DELAY_MS = 250; // Start with 250ms to reach ~500ms with jitter on first attempt
const MAX_RETRY_DELAY_MS = 10000; // Cap at 10 seconds
const MAX_BATCH_GET_ITEMS = 100; // AWS DynamoDB limit for batchGet operations
const MAX_BATCH_WRITE_ITEMS = 25; // AWS DynamoDB limit for batchWrite operations
const MAX_TRANSACTION_ITEMS = 100; // AWS DynamoDB limit for transaction operations
const MAX_ITEM_SIZE_BYTES = 400 * 1024; // AWS DynamoDB limit - 400KB per item
const MAX_REQUEST_SIZE_BYTES = 16 * 1024 * 1024; // AWS DynamoDB limit - 16MB per request

/**
 * Calculate exponential backoff delay with jitter
 * Examples of delays: (with base 250ms and 10% jitter)
 * Attempt 1: ~500ms
 * Attempt 2: ~1s
 * Attempt 3: ~2-2.5s
 */
const calculateRetryDelay = (attempt: number): number => {
  const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
  const delayWithJitter = exponentialDelay + jitter;
  return Math.min(delayWithJitter, MAX_RETRY_DELAY_MS);
};

/**
 * Check if an error is retryable
 */
const isRetryableError = (error: any): boolean => {
  return (
    error instanceof ProvisionedThroughputExceededException ||
    error.name === "ProvisionedThroughputExceededException" ||
    error.name === "ThrottlingException" ||
    error.name === "RequestLimitExceeded" ||
    error.name === "ServiceUnavailable" ||
    error.name === "InternalServerError"
  );
};

/**
 * Check if an error indicates a service/infrastructure failure that should affect circuit breaker
 * Circuit breaker should only trip on service failures, not user/application errors
 */
const isServiceFailure = (error: any): boolean => {
  return (
    error instanceof ProvisionedThroughputExceededException ||
    error.name === "ProvisionedThroughputExceededException" ||
    error.name === "ThrottlingException" ||
    error.name === "RequestLimitExceeded" ||
    error.name === "ServiceUnavailable" ||
    error.name === "InternalServerError" ||
    error.name === "RequestTimeout" ||
    error.name === "NetworkingError" ||
    // Include timeouts and connection issues
    (error.code && String(error.code).toLowerCase().includes("timeout")) ||
    (error.message && String(error.message).toLowerCase().includes("timeout")) ||
    (error.name && String(error.name).toLowerCase().includes("timeout"))
  );
};

// Circuit breaker state management
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 30000; // 30 seconds

  public canExecute(): boolean {
    if (this.state === "CLOSED") return true;

    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = "HALF_OPEN";
      }
    }

    return this.state === "HALF_OPEN";
  }

  public onSuccess(): void {
    this.failures = 0;
    this.state = "CLOSED";
  }

  public onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }

  public getState(): string {
    return this.state;
  }
}

// Global circuit breaker instance for DynamoDB operations
const dynamoDBCircuitBreaker = new CircuitBreaker();

/**
 * Validate item size limits
 */
const validateItemSize = (item: Record<string, any>, logger: LoggerBase): void => {
  const itemSize = JSON.stringify(item).length;
  if (itemSize > MAX_ITEM_SIZE_BYTES) {
    logger.error(`Item size ${itemSize} bytes exceeds DynamoDB limit of ${MAX_ITEM_SIZE_BYTES} bytes`);
    throw new Error(`Item size exceeds DynamoDB limit of 400KB`);
  }
};

/**
 *
 * @param input
 * @param _logger
 * @param cacheAction default is from cache
 * @returns
 */
export const getItem = async (input: GetCommandInput, _logger: LoggerBase, cacheAction: CacheAction) => {
  const stopwatch = new StopWatch("getItem");
  const logger = getLogger("getItem", _logger);
  try {
    stopwatch.start();
    logger.info("getting results from cache if available", "input =", input, "notFromCache=", cacheAction);

    const cache = await getItemMemoryCache;
    const cacheKey = JSON.stringify(input);
    if (cacheAction === CacheAction.NOT_FROM_CACHE || cacheAction === CacheAction.CLEAR_CACHE_NO_CALL) {
      await cache.del(cacheKey);
    }
    if (cacheAction !== CacheAction.CLEAR_CACHE_NO_CALL) {
      const outputPromise = cache.wrap(cacheKey, async () => {
        logger.info("calling db api call");
        let attempt = 0;
        while (attempt < MAX_RETRY_ATTEMPTS) {
          // Check circuit breaker on each attempt
          if (!dynamoDBCircuitBreaker.canExecute()) {
            throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
          }

          try {
            const dbOutput = await ddbClient.get(input);
            dynamoDBCircuitBreaker.onSuccess(); // Mark success for circuit breaker
            return dbOutput;
          } catch (err: any) {
            attempt++;
            // Only mark circuit breaker failure for service/infrastructure errors
            if (isServiceFailure(err) && attempt === 1) {
              dynamoDBCircuitBreaker.onFailure();
            }
            logger.error(`getItem operation failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`, err);

            // Handle specific DynamoDB errors
            if (err.name === "ValidationException") {
              logger.error("Validation error in getItem - check key format and table schema", err.message);
              throw err;
            } else if (err.name === "ResourceNotFoundException") {
              logger.error("Table not found in getItem", err.message);
              throw err;
            }

            // Retry for retryable errors including ProvisionedThroughputExceededException
            if (isRetryableError(err) && attempt < MAX_RETRY_ATTEMPTS) {
              const delay = calculateRetryDelay(attempt);
              logger.info(`Retrying getItem after ${delay}ms delay`);
              await scheduler.wait(delay);
              continue;
            }

            throw err;
          }
        }

        throw new Error("Maximum retry attempts exceeded");
      });

      logger.info("output =", await outputPromise);
      const output = await outputPromise;
      if (cacheAction === CacheAction.CLEAR_CACHE_AFTER_RESULT) {
        scheduler.wait(ms("10 msecs")).then(() => {
          cache.del(cacheKey);
        });
      }
      return output;
    }
    return null;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const putItem = async (input: PutCommandInput, _logger: LoggerBase) => {
  const stopwatch = new StopWatch("putItem");
  const logger = getLogger("putItem", _logger);

  // Validate item size if Item exists
  if (input.Item) {
    validateItemSize(input.Item, logger);
  }

  let attempt = 0;
  try {
    stopwatch.start();
    logger.info("input =", input);

    while (attempt < MAX_RETRY_ATTEMPTS) {
      // Check circuit breaker on each attempt
      if (!dynamoDBCircuitBreaker.canExecute()) {
        throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
      }

      try {
        const output = await ddbClient.put(input);
        dynamoDBCircuitBreaker.onSuccess(); // Mark success for circuit breaker
        logger.info("output =", output);
        return output;
      } catch (err: any) {
        attempt++;
        // Only mark circuit breaker failure for service/infrastructure errors
        if (isServiceFailure(err) && attempt === 1) {
          dynamoDBCircuitBreaker.onFailure();
        }
        logger.error(`putItem operation failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`, err);

        // Handle specific DynamoDB errors
        if (err.name === "ConditionalCheckFailedException") {
          logger.error("Conditional check failed - item may already exist or condition not met");
          throw err;
        } else if (err.name === "ValidationException") {
          logger.error("Validation error - check input parameters", err.message);
          throw err;
        } else if (err.name === "ResourceNotFoundException") {
          logger.error("Table not found", err.message);
          throw err;
        }

        // Retry for retryable errors
        if (isRetryableError(err) && attempt < MAX_RETRY_ATTEMPTS) {
          const delay = calculateRetryDelay(attempt);
          logger.info(`Retrying putItem after ${delay}ms delay`);
          await scheduler.wait(delay);
          continue;
        }

        throw err;
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error("Maximum retry attempts exceeded");
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const updateAttribute = async (input: UpdateCommandInput, _logger: LoggerBase) => {
  const stopwatch = new StopWatch("updateAttribute");
  const logger = getLogger("updateAttribute", _logger);

  let attempt = 0;
  try {
    stopwatch.start();
    const modifiedInput: UpdateCommandInput = { ReturnValues: ReturnValue.ALL_OLD, ...input };
    logger.info("input =", input);

    while (attempt < MAX_RETRY_ATTEMPTS) {
      // Check circuit breaker on each attempt
      if (!dynamoDBCircuitBreaker.canExecute()) {
        throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
      }

      try {
        const output = await ddbClient.update(modifiedInput);
        dynamoDBCircuitBreaker.onSuccess(); // Mark success for circuit breaker
        logger.info("output =", output);
        return output;
      } catch (err: any) {
        attempt++;
        // Only mark circuit breaker failure for service/infrastructure errors
        if (isServiceFailure(err) && attempt === 1) {
          dynamoDBCircuitBreaker.onFailure();
        }
        logger.error(`updateAttribute operation failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`, err);

        // Handle specific DynamoDB errors
        if (err.name === "ConditionalCheckFailedException") {
          logger.error("Conditional check failed - update condition not met");
          throw err;
        } else if (err.name === "ValidationException") {
          logger.error("Validation error - check update expression and parameters", err.message);
          throw err;
        } else if (err.name === "ResourceNotFoundException") {
          logger.error("Table or item not found", err.message);
          throw err;
        }

        // Retry for retryable errors including ProvisionedThroughputExceededException
        if (isRetryableError(err) && attempt < MAX_RETRY_ATTEMPTS) {
          const delay = calculateRetryDelay(attempt);
          logger.info(`Retrying updateAttribute after ${delay}ms delay`);
          await scheduler.wait(delay);
          continue;
        }

        throw err;
      }
    }

    throw new Error("Maximum retry attempts exceeded");
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const deleteItem = async (input: DeleteCommandInput, _logger: LoggerBase) => {
  const stopwatch = new StopWatch("deleteItem");
  const logger = getLogger("deleteItem", _logger);

  let attempt = 0;
  try {
    stopwatch.start();
    logger.info("input =", input);

    while (attempt < MAX_RETRY_ATTEMPTS) {
      // Check circuit breaker on each attempt
      if (!dynamoDBCircuitBreaker.canExecute()) {
        throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
      }

      try {
        const output = await ddbClient.delete(input);
        dynamoDBCircuitBreaker.onSuccess(); // Mark success for circuit breaker
        logger.info("output =", output);
        return output;
      } catch (err: any) {
        attempt++;
        // Only mark circuit breaker failure for service/infrastructure errors
        if (isServiceFailure(err) && attempt === 1) {
          dynamoDBCircuitBreaker.onFailure();
        }
        logger.error(`deleteItem operation failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`, err);

        // Handle specific DynamoDB errors
        if (err.name === "ConditionalCheckFailedException") {
          logger.error("Conditional check failed - delete condition not met");
          throw err;
        } else if (err.name === "ValidationException") {
          logger.error("Validation error - check delete parameters", err.message);
          throw err;
        } else if (err.name === "ResourceNotFoundException") {
          logger.error("Table or item not found", err.message);
          throw err;
        }

        // Retry for retryable errors including ProvisionedThroughputExceededException
        if (isRetryableError(err) && attempt < MAX_RETRY_ATTEMPTS) {
          const delay = calculateRetryDelay(attempt);
          logger.info(`Retrying deleteItem after ${delay}ms delay`);
          await scheduler.wait(delay);
          continue;
        }

        throw err;
      }
    }

    throw new Error("Maximum retry attempts exceeded");
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const queryOnce = async (input: QueryCommandInput, _logger: LoggerBase, cacheAction: CacheAction) => {
  const stopwatch = new StopWatch("queryOnce");
  const logger = getLogger("queryOnce", _logger);
  try {
    stopwatch.start();
    logger.info("input =", input);

    const cache = await getItemMemoryCache;
    const cacheKey = JSON.stringify(input);
    if (cacheAction === CacheAction.NOT_FROM_CACHE || cacheAction === CacheAction.CLEAR_CACHE_NO_CALL) {
      await cache.del(cacheKey);
    }
    if (cacheAction !== CacheAction.CLEAR_CACHE_NO_CALL) {
      const outputPromise = cache.wrap(cacheKey, async () => {
        logger.info("calling db api call");

        let attempt = 0;
        while (attempt < MAX_RETRY_ATTEMPTS) {
          // Check circuit breaker on each attempt
          if (!dynamoDBCircuitBreaker.canExecute()) {
            throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
          }

          try {
            const dbOutput = await ddbClient.query(input);
            dynamoDBCircuitBreaker.onSuccess(); // Mark success for circuit breaker
            return dbOutput;
          } catch (err: any) {
            attempt++;
            // Only mark circuit breaker failure for service/infrastructure errors
            if (isServiceFailure(err) && attempt === 1) {
              dynamoDBCircuitBreaker.onFailure();
            }
            logger.error(`queryOnce operation failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`, err);

            // Handle specific DynamoDB errors
            if (err.name === "ValidationException") {
              logger.error("Validation error - check query parameters and expressions", err.message);
              throw err;
            } else if (err.name === "ResourceNotFoundException") {
              logger.error("Table or index not found", err.message);
              throw err;
            }

            // Retry for retryable errors including ProvisionedThroughputExceededException
            if (isRetryableError(err) && attempt < MAX_RETRY_ATTEMPTS) {
              const delay = calculateRetryDelay(attempt);
              logger.info(`Retrying queryOnce after ${delay}ms delay`);
              await scheduler.wait(delay);
              continue;
            }

            throw err;
          }
        }

        throw new Error("Maximum retry attempts exceeded");
      });

      logger.info("output =", await outputPromise);
      const output = await outputPromise;
      if (cacheAction === CacheAction.CLEAR_CACHE_AFTER_RESULT) {
        scheduler.wait(ms("10 msecs")).then(() => {
          cache.del(cacheKey);
        });
      }

      return output;
    }
    return null;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const batchGet = async <T>(
  itemsKeys: Record<string, NativeAttributeValue>[],
  tableName: string,
  requestAttributes: Partial<Record<"ProjectionExpression", string>>,
  loggerBase: LoggerBase
) => {
  const stopwatch = new StopWatch("batchGet");
  const logger = getLogger("batchGet", loggerBase);
  let counter = 1;
  const itemResponse: T[] = [];

  try {
    let itemsToGet: Record<string, NativeAttributeValue>[] = [...itemsKeys];
    type BatchRequestItems = Record<
      string,
      Omit<KeysAndAttributes, "Keys"> & {
        Keys: Record<string, NativeAttributeValue>[];
      }
    >;

    const projectionAndExpressionAttr = getExpressionAttributeMap(requestAttributes.ProjectionExpression);
    while (itemsToGet.length > 0) {
      stopwatch.start("iteration-" + counter);

      // Take only up to MAX_BATCH_GET_ITEMS keys for this batch
      const batchKeys = itemsToGet.slice(0, MAX_BATCH_GET_ITEMS);
      const requestItems: BatchRequestItems = {};
      requestItems[tableName] = {
        Keys: batchKeys,
        ...projectionAndExpressionAttr
      };
      logger.debug("requesting [", batchKeys.length, "] items, requestItems =", requestItems);

      // Implement proper retry logic for this batch
      let attempt = 0;
      let batchSuccessful = false;

      while (attempt < MAX_RETRY_ATTEMPTS && !batchSuccessful) {
        // Check circuit breaker on each attempt
        if (!dynamoDBCircuitBreaker.canExecute()) {
          throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
        }

        try {
          const output = await ddbClient.batchGet({ RequestItems: requestItems });
          dynamoDBCircuitBreaker.onSuccess(); // Mark success for circuit breaker
          const items = (output.Responses && output.Responses[tableName]) || [];
          logger.info("retrieved items, output =", output, ", size of list=", items.length);

          // Handle unprocessed keys - these need to be retried
          const unprocessedKeys = (output.UnprocessedKeys && output.UnprocessedKeys[tableName] && output.UnprocessedKeys[tableName].Keys) || [];

          // Remove the processed keys from itemsToGet
          itemsToGet = itemsToGet.slice(MAX_BATCH_GET_ITEMS);

          // Add any unprocessed keys back to the front of the queue for retry
          if (unprocessedKeys.length > 0) {
            logger.info("Found", unprocessedKeys.length, "unprocessed keys, adding them for retry");
            itemsToGet = [...unprocessedKeys, ...itemsToGet];
          }

          itemResponse.push(...(items as T[]));
          batchSuccessful = true; // Mark this batch as successful
        } catch (err: any) {
          attempt++;
          // Only mark circuit breaker failure for service/infrastructure errors
          if (isServiceFailure(err) && attempt === 1) {
            dynamoDBCircuitBreaker.onFailure();
          }
          logger.error(`batchGet operation failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`, err);

          // Handle specific DynamoDB errors
          if (err.name === "ValidationException") {
            logger.error("Validation error in batchGet - check request format and table schema", err.message);
            throw err;
          } else if (err.name === "ResourceNotFoundException") {
            logger.error("Table not found in batchGet", err.message);
            throw err;
          }

          // Retry for retryable errors
          if (isRetryableError(err) && attempt < MAX_RETRY_ATTEMPTS) {
            const delay = calculateRetryDelay(attempt);
            logger.info(`Retrying batchGet after ${delay}ms delay`);
            await scheduler.wait(delay);
            continue;
          }

          throw err;
        }
      }

      if (!batchSuccessful) {
        throw new Error("Maximum retry attempts exceeded for batchGet operation");
      }

      stopwatch.stop();
      counter++;
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

  // Check circuit breaker
  if (!dynamoDBCircuitBreaker.canExecute()) {
    throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
  }

  // Validate input limits
  if (items.length === 0) {
    logger.info("No items to process in batchAddUpdate");
    return;
  }

  if (items.length > 1000) {
    logger.warn(`Large batch detected: ${items.length} items. Consider breaking into smaller batches for better performance.`);
  }

  // Validate item sizes
  items.forEach((item, index) => {
    try {
      validateItemSize(item, logger);
    } catch (err) {
      throw new Error(`Item at index ${index} is too large: ${err}`);
    }
  });

  try {
    stopwatch.start();
    let startInd = 0,
      endInd = 0;

    while (endInd < items.length) {
      startInd = endInd;
      endInd = Math.min(items.length, endInd + MAX_BATCH_WRITE_ITEMS);
      const batchWriteItems = items.slice(startInd, endInd);
      const requestItems: any = {};
      requestItems[tableName] = batchWriteItems.map((item) => ({ PutRequest: { Item: item } }));

      // Calculate batch size for monitoring
      const batchSizeBytes = JSON.stringify(requestItems).length;
      if (batchSizeBytes > MAX_REQUEST_SIZE_BYTES) {
        logger.error(`Batch size ${batchSizeBytes} bytes exceeds DynamoDB limit of ${MAX_REQUEST_SIZE_BYTES} bytes`);
        throw new Error("Batch request size exceeds DynamoDB limit of 16MB");
      }

      // Check circuit breaker before each batch
      if (!dynamoDBCircuitBreaker.canExecute()) {
        throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
      }

      const batchWriteResults = await batchWriteWithRetry({ RequestItems: requestItems }, logger);
      logger.info(
        "items.length",
        items.length,
        "startInd",
        startInd,
        "endInd",
        endInd,
        "batchSizeBytes",
        batchSizeBytes,
        "batchWriteResults",
        batchWriteResults
      );
    }
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

const batchWriteWithRetry = async (batchWriteItemsInput: BatchWriteCommandInput, logger: LoggerBase): Promise<any> => {
  const stopwatch = new StopWatch("batchWriteWithRetry");
  stopwatch.start();
  let results: any = null;

  let attempt = 0;
  try {
    logger.debug("before adding, batchWriteItemsInput=", batchWriteItemsInput);

    while (attempt < MAX_RETRY_ATTEMPTS) {
      // Check circuit breaker on each attempt
      if (!dynamoDBCircuitBreaker.canExecute()) {
        throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
      }

      try {
        results = await ddbClient.batchWrite(batchWriteItemsInput);
        dynamoDBCircuitBreaker.onSuccess(); // Mark success for circuit breaker
        logger.debug("after batchwrite, results=", results);

        // Handle unprocessed items with exponential backoff
        if (results.UnprocessedItems && Object.keys(results.UnprocessedItems).length > 0) {
          const unprocessedCount = Object.values(results.UnprocessedItems).reduce((count: number, items: any) => count + items.length, 0);
          logger.info(`Found ${unprocessedCount} unprocessed items, retrying...`);

          const delay = calculateRetryDelay(attempt + 1);
          logger.info(`Waiting ${delay}ms before retrying unprocessed items`);
          await scheduler.wait(delay);

          const retryInput: BatchWriteCommandInput = { RequestItems: results.UnprocessedItems };
          const retryResults: any = await batchWriteWithRetry(retryInput, logger);

          // Merge results
          if (retryResults) {
            results = {
              ...results,
              UnprocessedItems: retryResults.UnprocessedItems || {},
              ItemCollectionMetrics: {
                ...results.ItemCollectionMetrics,
                ...retryResults.ItemCollectionMetrics
              }
            };
          }
        }

        return results; // Success, return results
      } catch (err: any) {
        attempt++;
        // Only mark circuit breaker failure for service/infrastructure errors
        if (isServiceFailure(err) && attempt === 1) {
          dynamoDBCircuitBreaker.onFailure();
        }
        logger.error(`batchWrite failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`, err);

        // Handle specific DynamoDB errors immediately (non-retryable)
        if (err.name === "ValidationException") {
          logger.error("Validation error in batch write - check item format and table schema", err.message);
          throw err;
        } else if (err.name === "ResourceNotFoundException") {
          logger.error("Table not found in batch write", err.message);
          throw err;
        } else if (err.name === "ItemCollectionSizeLimitExceededException") {
          logger.error("Item collection size limit exceeded", err.message);
          throw err;
        }

        // Retry for retryable errors
        if (isRetryableError(err) && attempt < MAX_RETRY_ATTEMPTS) {
          const delay = calculateRetryDelay(attempt);
          logger.info(`Retrying batchWrite after ${delay}ms delay`);
          await scheduler.wait(delay);
          continue;
        }

        throw err;
      }
    }

    throw new Error("Maximum retry attempts exceeded for batchWrite operation");
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
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

    // Check circuit breaker
    if (!dynamoDBCircuitBreaker.canExecute()) {
      throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
    }

    let output: QueryCommandOutput | undefined;
    let lastEvaluatedKey = undefined;
    const items = [];
    let count = 1;
    let totalConsumedCapacity = 0;

    logger.info("starting to query DB in loop until all items are retrieved satisfying input command");

    do {
      try {
        qsw.start("iteration" + count);
        const cmdInput: QueryCommandInput = {
          ...input,
          ExclusiveStartKey: lastEvaluatedKey,
          // Add consumed capacity monitoring
          ReturnConsumedCapacity: "TOTAL"
        };
        logger.info("cmdInput =", cmdInput);

        let queryAttempt = 0;
        while (queryAttempt < MAX_RETRY_ATTEMPTS) {
          // Check circuit breaker on each attempt
          if (!dynamoDBCircuitBreaker.canExecute()) {
            throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
          }

          try {
            output = await ddbClient.query(cmdInput);
            dynamoDBCircuitBreaker.onSuccess(); // Mark success for circuit breaker
            break; // Success, exit retry loop
          } catch (err: any) {
            queryAttempt++;
            // Only mark circuit breaker failure for service/infrastructure errors
            if (isServiceFailure(err) && queryAttempt === 1) {
              dynamoDBCircuitBreaker.onFailure();
            }
            logger.error(`queryAll iteration failed (attempt ${queryAttempt}/${MAX_RETRY_ATTEMPTS})`, err);

            // Handle specific DynamoDB errors
            if (err.name === "ValidationException") {
              logger.error("Validation error in queryAll - check query parameters and expressions", err.message);
              throw err;
            } else if (err.name === "ResourceNotFoundException") {
              logger.error("Table or index not found in queryAll", err.message);
              throw err;
            }

            // Retry for retryable errors
            if (isRetryableError(err) && queryAttempt < MAX_RETRY_ATTEMPTS) {
              const delay = calculateRetryDelay(queryAttempt);
              logger.info(`Retrying queryAll after ${delay}ms delay`);
              await scheduler.wait(delay);
              continue;
            }

            throw err;
          }
        }

        // Ensure output is defined before proceeding
        if (!output) {
          throw new Error("Failed to get query output after all retry attempts");
        }

        lastEvaluatedKey = output.LastEvaluatedKey;
        items.push(...(output.Items || []));

        // Track consumed capacity
        if (output.ConsumedCapacity) {
          totalConsumedCapacity += output.ConsumedCapacity.CapacityUnits || 0;
        }

        logger.info(
          "retrieved db result count =",
          output.Count,
          ", total item count = ",
          items.length,
          ", consumed capacity =",
          output.ConsumedCapacity?.CapacityUnits || 0,
          ", total consumed =",
          totalConsumedCapacity,
          ", output =",
          { ...output, Items: null },
          ", lastEvaluatedKey =",
          lastEvaluatedKey
        );

        // Add adaptive delay based on consumed capacity to prevent throttling
        if (output.ConsumedCapacity?.CapacityUnits && output.ConsumedCapacity.CapacityUnits > 10) {
          const delay = Math.min(output.ConsumedCapacity.CapacityUnits * 10, 1000); // Max 1 second
          logger.info(`High capacity consumption detected, adding ${delay}ms delay to prevent throttling`);
          await scheduler.wait(delay);
        }

        count++;

        // Safety limit to prevent runaway queries
        if (count > 1000) {
          logger.error(`Query iteration limit exceeded (${count}). Possible infinite loop detected.`);
          throw new Error("Query iteration limit exceeded - possible infinite loop");
        }
      } finally {
        qsw.stop();
        logger.info("stopwatch summary", qsw.shortSummary());
      }
    } while (lastEvaluatedKey);

    logger.info(`Query completed: ${items.length} total items, ${totalConsumedCapacity} total capacity units consumed`);
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
          TableName: tableName || (it.TableName as string)
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
        TableName: tableName
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
      if (this.items.length === 0) {
        logger.info("No transaction items to execute");
        return;
      }

      // Validate transaction limits
      if (this.items.length > MAX_TRANSACTION_ITEMS) {
        throw new Error(`Transaction exceeds maximum items limit. Found ${this.items.length}, maximum allowed is ${MAX_TRANSACTION_ITEMS}`);
      }

      // Validate transaction size
      const transactionSizeBytes = JSON.stringify(this.items).length;
      if (transactionSizeBytes > MAX_REQUEST_SIZE_BYTES) {
        logger.error(`Transaction size ${transactionSizeBytes} bytes exceeds DynamoDB limit of ${MAX_REQUEST_SIZE_BYTES} bytes`);
        throw new Error("Transaction request size exceeds DynamoDB limit of 16MB");
      }

      logger.info("scheduled", this.items.length, "items are getting written in a transaction", "sizeBytes=", transactionSizeBytes);

      let attempt = 0;
      while (attempt < MAX_RETRY_ATTEMPTS) {
        // Check circuit breaker on each attempt
        if (!dynamoDBCircuitBreaker.canExecute()) {
          throw new Error(`DynamoDB circuit breaker is ${dynamoDBCircuitBreaker.getState()} - operations temporarily disabled`);
        }

        try {
          const transactWriteResult = await ddbClient.transactWrite({
            TransactItems: this.items
          });
          dynamoDBCircuitBreaker.onSuccess(); // Mark success for circuit breaker
          logger.info("transactWriteResult =", transactWriteResult);
          return transactWriteResult;
        } catch (err: any) {
          attempt++;
          // Only mark circuit breaker failure for service/infrastructure errors
          if (isServiceFailure(err) && attempt === 1) {
            dynamoDBCircuitBreaker.onFailure();
          }
          logger.error(`Transaction failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})`, err);

          // Handle specific transaction errors
          if (err.name === "TransactionCanceledException") {
            logger.error("Transaction canceled - one or more conditional checks failed", err.message);
            // Log details about which condition failed if available
            if (err.CancellationReasons) {
              logger.error("Cancellation reasons:", err.CancellationReasons);
            }
            throw err;
          } else if (err.name === "ValidationException") {
            logger.error("Validation error in transaction - check transaction items and expressions", err.message);
            throw err;
          } else if (err.name === "ResourceNotFoundException") {
            logger.error("Table not found in transaction", err.message);
            throw err;
          }

          // Retry for retryable errors
          if (isRetryableError(err) && attempt < MAX_RETRY_ATTEMPTS) {
            const delay = calculateRetryDelay(attempt);
            logger.info(`Retrying transaction after ${delay}ms delay`);
            await scheduler.wait(delay);
            continue;
          }

          throw err;
        }
      }

      throw new Error("Maximum retry attempts exceeded for transaction");
    } finally {
      sw.stop();
      logger.info("stopwatch summary: ", sw.shortSummary());
    }
  }
}

const getExpressionAttributeMap = (projectionExpression?: string): Omit<KeysAndAttributes, "Keys"> => {
  if (!projectionExpression) {
    return {};
  }

  let i = 1;
  const expressionAttrNameMap: Record<string, string> = {};
  const convertedProjectedExpressionList = projectionExpression.split(",").map((prjExpr) => {
    return prjExpr.split(".").reduce((exp, ep) => {
      const expp: string[] = [];

      if (exp) {
        expp.push(exp);
      }

      if (isKeywordDynamoDbReserve(ep)) {
        if (!expressionAttrNameMap[ep]) {
          expressionAttrNameMap[ep] = "#ea" + i;
          i++;
        }
        expp.push(expressionAttrNameMap[ep]);
      } else {
        expp.push(ep);
      }

      return expp.join(".");
    }, "");
  });

  return {
    ProjectionExpression: convertedProjectedExpressionList.join(","),
    ExpressionAttributeNames: i === 1 ? undefined : Object.fromEntries(Object.entries(expressionAttrNameMap).map(([k, v]) => [v, k]))
  };
};
