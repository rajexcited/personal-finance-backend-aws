import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { ConstructProps, EnvironmentName } from "./common";

const ONE_MONTH = 30;
const HALF_YEAR = 6 * ONE_MONTH;
const ONE_YEAR = 2 * HALF_YEAR;

export class ReceiptS3Construct extends Construct {
  public readonly receiptBucket: s3.IBucket;
  public readonly deleteTags: Record<string, string>;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);
    this.deleteTags = { delete: "schedule" };

    const receiptBucket = new s3.Bucket(this, "ReceiptBucketS3", {
      bucketName: [props.resourcePrefix, props.environment, "expense", "receipt", "bucket", "s3"].join("-"),
      removalPolicy: props.environment === EnvironmentName.Production ? RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE : RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          expiration: Duration.days(2),
          prefix: "temp/",
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
        {
          prefix: "receipts/",
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: Duration.days(30),
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
          prefix: "receipts/",
          expiration: Duration.days(1),
          tagFilters: { ...this.deleteTags },
        },
      ],
    });

    this.receiptBucket = receiptBucket;
  }
}
