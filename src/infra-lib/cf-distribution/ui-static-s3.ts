import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import { RemovalPolicy } from "aws-cdk-lib";
import { AwsResourceType, ConstructProps, buildResourceName } from "../common";

interface UiStaticS3Props extends ConstructProps {
  uiPathPrefix: string;
  errorsPathPrefix: string;
  homepagePath: string;
}

export class UiStaticS3Construct extends Construct {
  public readonly uiBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: UiStaticS3Props) {
    super(scope, id);

    const uiBucket = new s3.Bucket(this, "UIStaticBucketS3", {
      autoDeleteObjects: true,
      bucketName: buildResourceName(["ui", "static"], AwsResourceType.S3Bucket, props),
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.uiBucket = uiBucket;

    const cfErrorBucketDeploymentConstructId = buildResourceName(["cf", "error"], AwsResourceType.BucketDeployment, props);
    const cfErrorDeployment = new s3Deploy.BucketDeployment(this, cfErrorBucketDeploymentConstructId, {
      destinationBucket: uiBucket,
      sources: [s3Deploy.Source.asset("src/error-pages")],
      destinationKeyPrefix: props.errorsPathPrefix.slice(1) + "/",
    });

    const cfCountryDataBucketDeploymentConstructId = buildResourceName(["cf", "country"], AwsResourceType.BucketDeployment, props);
    const cntryDataDeployment = new s3Deploy.BucketDeployment(this, cfCountryDataBucketDeploymentConstructId, {
      destinationBucket: uiBucket,
      sources: [s3Deploy.Source.asset("src/config-data", { exclude: ["**/default-*.json"] })],
      destinationKeyPrefix: props.uiPathPrefix.slice(1) + "/config/",
    });
  }
}
