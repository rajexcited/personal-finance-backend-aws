import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { ConstructProps, InfraEnvironmentId, buildResourceName, AwsResourceType, ExpenseReceiptContextInfo } from "./common";
import { parsedDuration } from "./common/utils";

const ONE_MONTH = 30;
const HALF_YEAR = 6 * ONE_MONTH;
const ONE_YEAR = 2 * HALF_YEAR;

interface receiptS3Props extends ConstructProps {
  expenseReceiptContext: ExpenseReceiptContextInfo;
}

export class ReceiptS3Construct extends Construct {
  public readonly receiptBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: receiptS3Props) {
    super(scope, id);

    const receiptBucket = new s3.Bucket(this, "ReceiptBucketS3", {
      bucketName: buildResourceName(["expense", "receipt"], AwsResourceType.S3Bucket, props),
      removalPolicy: props.environment === InfraEnvironmentId.Production ? RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE : RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          expiration: parsedDuration(props.expenseReceiptContext.expiration.temporaryReceipt),
          prefix: props.expenseReceiptContext.temporaryKeyPrefix,
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
        {
          prefix: props.expenseReceiptContext.finalizeReceiptKeyPrefix,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: Duration.days(ONE_MONTH),
            },
            {
              storageClass: s3.StorageClass.GLACIER_INSTANT_RETRIEVAL,
              transitionAfter: Duration.days(HALF_YEAR),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: Duration.days(ONE_YEAR + HALF_YEAR),
            },
          ],
        },
        {
          prefix: props.expenseReceiptContext.finalizeReceiptKeyPrefix,
          expiration: parsedDuration(props.expenseReceiptContext.expiration.finalizeReceipt),
          tagFilters: { ...props.expenseReceiptContext.deleteTags },
        },
      ],
    });

    this.receiptBucket = receiptBucket;
  }
}
