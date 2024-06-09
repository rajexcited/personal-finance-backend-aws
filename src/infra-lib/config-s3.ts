import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import { ConstructProps, buildResourceName, AwsResourceType } from "./common";
import { RemovalPolicy } from "aws-cdk-lib";

export class ConfigS3Construct extends Construct {
  public readonly configBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const configBucket = new s3.Bucket(this, "ConfigDataBucketS3", {
      autoDeleteObjects: true,
      bucketName: buildResourceName(["config", "data"], AwsResourceType.S3Bucket, props),
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.configBucket = configBucket;

    const deployment = new s3Deploy.BucketDeployment(this, "ConfigBucketDeployment", {
      destinationBucket: configBucket,
      sources: [s3Deploy.Source.asset("src/config-data")],
    });
  }
}
