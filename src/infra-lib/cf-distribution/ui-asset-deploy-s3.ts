import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import { ConstructProps } from "../common";

interface UiAssetDeployS3Props extends ConstructProps {
  uiPathPrefix: string;
  homepagePath: string;
  uiBucketArn: string;
}

export class UiAssetDeployS3Construct extends Construct {
  constructor(scope: Construct, id: string, props: UiAssetDeployS3Props) {
    super(scope, id);

    const uiBucket = s3.Bucket.fromBucketArn(this, "UiBucketFromArn", props.uiBucketArn);

    const uiDeployment = new s3Deploy.BucketDeployment(this, "UiStaticBucketDeployment", {
      destinationBucket: uiBucket,
      sources: [
        s3Deploy.Source.asset("dist/ui", {
          exclude: ["**/*.html"],
        }),
      ],
      destinationKeyPrefix: props.uiPathPrefix.slice(1) + "/",
    });

    const homepageDeployment = new s3Deploy.BucketDeployment(this, "HomepageBucketDeployment", {
      destinationBucket: uiBucket,
      sources: [
        s3Deploy.Source.asset("dist/ui", {
          exclude: ["**/static/**", "*.jpeg", "*.png", "*.json", "*.ico", "*.txt", "*.css", "*.js"],
        }),
      ],
      destinationKeyPrefix: props.homepagePath + "/",
    });
  }
}
