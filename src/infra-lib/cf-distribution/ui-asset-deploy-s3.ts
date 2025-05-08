import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import * as logs from "aws-cdk-lib/aws-logs";
import { AwsResourceType, buildResourceName, ConstructProps } from "../common";

interface UiAssetDeployS3Props extends ConstructProps {
  uiPathPrefix: string;
  homepagePath: string;
  uiBucketArn: string;
}

export class UiAssetDeployS3Construct extends Construct {
  constructor(scope: Construct, id: string, props: UiAssetDeployS3Props) {
    super(scope, id);

    const uiBucket = s3.Bucket.fromBucketArn(this, "UiBucketFromArn", props.uiBucketArn);

    const uiStaticBucketDeploymentConstructId = buildResourceName(["ui", "static", "site"], AwsResourceType.BucketDeployment, props);
    const uiDeployment = new s3Deploy.BucketDeployment(this, uiStaticBucketDeploymentConstructId, {
      destinationBucket: uiBucket,
      sources: [s3Deploy.Source.asset("dist/ui")],
      logRetention: logs.RetentionDays.ONE_MONTH
    });
  }
}
