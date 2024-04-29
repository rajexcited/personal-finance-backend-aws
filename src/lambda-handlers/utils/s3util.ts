import { S3Client, GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { LoggerBase, getLogger } from "./logger";
import { StopWatch } from "stopwatch-node";
import { _logger } from "./base-config";

const _s3Client = new S3Client({});
export const client = _s3Client;
const __logger = getLogger("s3util", _logger);

export async function getJsonObjectFromS3<T>(bucketName: string, s3Key: string, _logger: LoggerBase): Promise<T | null> {
  const stopwatch = new StopWatch("getJsonObjectFromS3");
  const logger = getLogger("getJsonObjectFromS3", __logger, _logger);

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
}

export const copyObject = async (bucketName: string, sourceKey: string, destinationKey: string, _logger: LoggerBase) => {
  const stopwatch = new StopWatch("copyObject");
  const logger = getLogger("copyObject", __logger, _logger);
  try {
    stopwatch.start();
    const copyCmd = new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: sourceKey,
      Key: destinationKey,
    });
    logger.info("copy command =", copyCmd);

    const copyOutput = await _s3Client.send(copyCmd);
    logger.info("copyOutput =", copyOutput);
  } finally {
    stopwatch.stop();
    logger.info("stopwatch summary", stopwatch.shortSummary());
  }
};
