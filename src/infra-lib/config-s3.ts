import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { ConstructProps } from "./common";
import * as path from "path";
import { RemovalPolicy } from "aws-cdk-lib";

export class ConfigS3Construct extends Construct {
  public readonly configBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const configBucket = new s3.Bucket(this, "ConfigDataBucketS3", {
      autoDeleteObjects: true,
      bucketName: [props.resourcePrefix, props.environment, "config", "data", "bucket", "s3"].join("-"),
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.configBucket = configBucket;

    const deployment = new s3Deploy.BucketDeployment(this, "ConfigBucketDeployment", {
      destinationBucket: configBucket,
      sources: [s3Deploy.Source.asset("src/config-data")],
    });
  }
}
