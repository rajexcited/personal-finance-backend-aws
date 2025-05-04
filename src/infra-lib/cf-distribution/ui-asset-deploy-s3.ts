import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
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

    const uiStaticBucketDeploymentConstructId = buildResourceName(["ui", "static"], AwsResourceType.BucketDeployment, props);
    const uiDeployment = new s3Deploy.BucketDeployment(this, uiStaticBucketDeploymentConstructId, {
      destinationBucket: uiBucket,
      sources: [
        s3Deploy.Source.asset("dist/ui", {
          exclude: ["**/*.html"]
        })
      ],
      destinationKeyPrefix: props.uiPathPrefix.slice(1) + "/"
    });

    const homepageBucketDeploymentConstructId = buildResourceName(["homepage"], AwsResourceType.BucketDeployment, props);
    const homepageDeployment = new s3Deploy.BucketDeployment(this, homepageBucketDeploymentConstructId, {
      destinationBucket: uiBucket,
      sources: [
        s3Deploy.Source.asset("dist/ui", {
          exclude: ["**/static/**", "*.jpeg", "*.png", "*.json", "*.ico", "*.txt", "*.css", "*.js"]
        })
      ],
      destinationKeyPrefix: props.homepagePath + "/"
    });

    // due to different folder structure of dist against CF S3 structure requirements, if both runs are overlapping, 1 of them will fail.
    // by having dependency making sure that both runs are in proper order so that we dont loose files and deployment doesn't hang.
    uiDeployment.node.addDependency(homepageDeployment);
  }
}
