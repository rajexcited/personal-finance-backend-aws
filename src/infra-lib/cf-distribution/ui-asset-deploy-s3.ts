import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import { AwsResourceType, buildResourceName, ConstructProps } from "../common";

interface UiAssetDeployS3Props extends ConstructProps {
  uiPathPrefix: string;
  homepagePath: string;
  uiBucketArn: string;
  cfDistribution: cf.IDistribution;
}

export class UiAssetDeployS3Construct extends Construct {
  constructor(scope: Construct, id: string, props: UiAssetDeployS3Props) {
    super(scope, id);

    const uiBucket = s3.Bucket.fromBucketArn(this, "UiBucketFromArn", props.uiBucketArn);

    const uiStaticBucketDeploymentConstructId = buildResourceName(["ui", "static"], AwsResourceType.BucketDeployment, props);
    const uiDeployment = new s3Deploy.BucketDeployment(this, uiStaticBucketDeploymentConstructId, {
      destinationBucket: uiBucket,
      sources: [
        s3Deploy.Source.asset("dist/ui", {
          exclude: ["**/*.html"]
        })
      ],
      retainOnDelete: false,
      logRetention: logs.RetentionDays.ONE_MONTH,
      destinationKeyPrefix: props.uiPathPrefix.slice(1) + "/",
      memoryLimit: 256
    });

    const homepageBucketDeploymentConstructId = buildResourceName(["homepage"], AwsResourceType.BucketDeployment, props);
    const homepageDeployment = new s3Deploy.BucketDeployment(this, homepageBucketDeploymentConstructId, {
      destinationBucket: uiBucket,
      sources: [
        s3Deploy.Source.asset("dist/ui", {
          exclude: ["**/static/**", "*.jpeg", "*.png", "*.json", "*.ico", "*.txt", "*.css", "*.js"]
        })
      ],
      retainOnDelete: false,
      logRetention: logs.RetentionDays.ONE_MONTH,
      destinationKeyPrefix: props.homepagePath + "/",
      distribution: props.cfDistribution
    });
  }
}
