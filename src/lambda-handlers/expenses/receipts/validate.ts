import { GetObjectAttributesCommand, GetObjectAttributesCommandInput, ObjectAttributes } from "@aws-sdk/client-s3";
import { LoggerBase, getLogger, s3utils } from "../../utils";
import { _expenseReceiptsBucketName } from "./base-config";

export const isValidPathKey = async (s3Key: string, _logger: LoggerBase) => {
  const logger = getLogger(`isValidpathKey.name.${s3Key.split("/").slice(-1)}`, _logger);
  try {
    const getObjAttrCmdInput = new GetObjectAttributesCommand({
      Bucket: _expenseReceiptsBucketName,
      Key: s3Key,
      ObjectAttributes: [ObjectAttributes.OBJECT_SIZE, ObjectAttributes.STORAGE_CLASS],
    });
    logger.info("get Object Attribute Command Input", getObjAttrCmdInput);
    const objAttrOutput = await s3utils.client.send(getObjAttrCmdInput);
    logger.info("get object Attribute Output", objAttrOutput);
    return !!objAttrOutput.StorageClass && !!objAttrOutput.ObjectSize;
  } catch (err) {
    logger.error("error getting object attrubute", err);
    return false;
  }
};
