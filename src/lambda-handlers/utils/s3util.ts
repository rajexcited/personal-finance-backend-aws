import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  ObjectAttributes,
  GetObjectAttributesCommand,
  HeadObjectCommand,
  PutObjectTaggingCommand,
  DeleteObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import { StopWatch } from "stopwatch-node";
import { LoggerBase, getLogger } from "./logger";
import { _logger } from "./base-config";

const _s3Client = new S3Client({});
const __logger = getLogger("s3util", _logger);

export const getJsonObjectFromS3 = async <T>(bucketName: string, s3Key: string, baseLogger: LoggerBase): Promise<T | null> => {
  const stopwatch = new StopWatch("getJsonObjectFromS3");
  const logger = getLogger("getJsonObjectFromS3", __logger, baseLogger);

  try {
    stopwatch.start();
    logger.info("bucketName", bucketName, "key", s3Key);
    if (!bucketName) return null;
    if (!s3Key) return null;

    const s3Result = await _s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3Key }));
    logger.info("keys in s3Result", Object.keys(s3Result), "s3 result", { ...s3Result, Body: null });

    const jsonString = await s3Result.Body?.transformToString();
    if (jsonString) {
      const configData = JSON.parse(jsonString);
      logger.info("retrieved json object from s3");
      return configData as T;
    }
    logger.warn("could not retrieve key object as string");
    return null;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const headObject = async (bucketName: string, s3key: string, baseLogger: LoggerBase) => {
  const stopwatch = new StopWatch("headObject");
  const logger = getLogger("headObject", __logger, baseLogger);
  try {
    stopwatch.start();
    const headObjCmdInput = new HeadObjectCommand({
      Bucket: bucketName,
      Key: s3key,
    });
    logger.info("Head Object Command Input =", headObjCmdInput);
    const headObjCmdOutput = await _s3Client.send(headObjCmdInput);
    logger.info("Head object Command Output =", headObjCmdOutput);

    return headObjCmdOutput;
  } catch (err) {
    logger.error("api call error", err);
    return null;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const getObjectAttributes = async (bucketName: string, s3key: string, attributes: ObjectAttributes[], baseLogger: LoggerBase) => {
  const stopwatch = new StopWatch("getObjectAttributes");
  const logger = getLogger("getObjectAttributes", __logger, baseLogger);
  try {
    stopwatch.start();
    const getObjAttrCmdInput = new GetObjectAttributesCommand({
      Bucket: bucketName,
      Key: s3key,
      ObjectAttributes: attributes,
    });
    logger.info("get Object Attribute Command Input =", getObjAttrCmdInput);
    const objAttrOutput = await _s3Client.send(getObjAttrCmdInput);
    logger.info("get object Attribute Output =", objAttrOutput);

    return objAttrOutput;
  } catch (err) {
    logger.error("api call error", err);
    return null;
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export interface SourceDestKeyMap {
  sourceKey: string;
  destinationKey: string;
}

export const copyObjects = async (
  sourceBucketName: string,
  destinationBucketName: string | null,
  keyMaps: SourceDestKeyMap[],
  logger: LoggerBase
) => {
  const copyPromises = keyMaps.map(async (km) => {
    await copyObject(sourceBucketName, km.sourceKey, destinationBucketName, km.destinationKey, logger);
  });
  await Promise.all(copyPromises);
};

export const copyObject = async (
  sourceBucketName: string,
  sourceKey: string,
  destinationBucketName: string | null,
  destinationKey: string,
  baseLogger: LoggerBase
) => {
  const stopwatch = new StopWatch("copyObject");
  const logger = getLogger("copyObject", __logger, baseLogger);
  try {
    stopwatch.start();
    const copyCmd = new CopyObjectCommand({
      Bucket: destinationBucketName || sourceBucketName,
      Key: destinationKey,
      CopySource: `/${sourceBucketName}/${sourceKey}`,
    });
    logger.info("copy command =", copyCmd);

    const copyOutput = await _s3Client.send(copyCmd);
    logger.info("copyOutput =", copyOutput);
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const addTags = async (bucketName: string, keys: string | string[], tags: Record<string, string>, baseLogger: LoggerBase) => {
  const stopwatch = new StopWatch("addTags");
  const logger = getLogger("addTags", __logger, baseLogger);
  try {
    stopwatch.start();
    const objKeys = Array.isArray(keys) ? keys : [keys];
    if (objKeys.length === 0) {
      logger.info("there are no keys to add tags to. so skipping");
      return;
    }
    const addTagsPromises = objKeys.map(async (key) => {
      const addTagCmd = new PutObjectTaggingCommand({
        Bucket: bucketName,
        Key: key,
        Tagging: { TagSet: Object.entries(tags).map((entry) => ({ Key: entry[0], Value: entry[1] })) },
      });
      logger.info("add tags command =", addTagCmd);
      const addTagCmdOutput = await _s3Client.send(addTagCmd);
      logger.info("add tags command output =", addTagCmdOutput);
      return addTagCmdOutput;
    });
    await Promise.all(addTagsPromises);
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};

export const deleteTags = async (bucketName: string, keys: string | string[], baseLogger: LoggerBase) => {
  const stopwatch = new StopWatch("deleteTags");
  const logger = getLogger("deleteTags", __logger, baseLogger);
  try {
    stopwatch.start();
    const objKeys = Array.isArray(keys) ? keys : [keys];
    if (objKeys.length === 0) {
      logger.info("there are no keys to delete tags to. so skipping");
      return;
    }
    const deleteTagsPromises = objKeys.map(async (key) => {
      const deleteTagCmd = new DeleteObjectTaggingCommand({
        Bucket: bucketName,
        Key: key,
      });
      logger.info("delete tags command =", deleteTagCmd);
      const deleteTagCmdOutput = await _s3Client.send(deleteTagCmd);
      logger.info("delete tags command output =", deleteTagCmdOutput);
      return deleteTagCmdOutput;
    });
    await Promise.all(deleteTagsPromises);
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};
