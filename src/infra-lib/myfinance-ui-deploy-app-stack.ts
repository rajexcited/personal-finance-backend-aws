import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConstructProps, ContextInfo } from "./common";
import { UiAssetDeployS3Construct } from "./cf-distribution";

/*
 * https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
 */

/**
 * stack props
 */
interface MyFinanceUiDeployAppStackProps extends StackProps, ConstructProps {
  uiBucketArn: string;
}

export class MyFinanceUiDeployAppStack extends Stack {
  constructor(scope: Construct, id: string, props: MyFinanceUiDeployAppStackProps) {
    super(scope, id, props);

    const contextInfo = this.node.tryGetContext(props.environment) as ContextInfo;

    const uiDeploy = new UiAssetDeployS3Construct(this, "UiAssetDeployS3Construct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
      uiBucketArn: props.uiBucketArn,
      uiPathPrefix: contextInfo.cloudfront.pathPrefix.ui,
      homepagePath: contextInfo.cloudfront.homepageUrl,
    });
  }
}
