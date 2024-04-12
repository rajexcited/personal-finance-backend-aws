import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { LoggerBase, getLogger } from "./logger";

const _s3Client = new S3Client({});

export async function getJsonObjectFromS3<T>(s3Key: string, baseLogger: LoggerBase): Promise<T | null> {
  const logger = getLogger("getJsonObjectFromS3", baseLogger);
  const configDataBucketName = process.env.CONFIG_DATA_BUCKET_NAME as string;
  logger.info("configDataBucketName", configDataBucketName, "key", s3Key);

  const s3Result = await _s3Client.send(new GetObjectCommand({ Bucket: configDataBucketName, Key: s3Key }));
  logger.info("keys in s3Result", Object.keys(s3Result), "s3 result", { ...s3Result, Body: null });

  const jsonString = await s3Result.Body?.transformToString();
  if (jsonString) {
    const configData = JSON.parse(jsonString);
    logger.info("retrieved json object from s3");
    return configData as T;
  }
  logger.warn("could not retrieve key object as string");
  return null;
}
