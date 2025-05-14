import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import { ConstructProps, ContextInfo } from "../common";
import { DomainCfConstruct } from "./domain-cf";
import { UiStaticS3Construct } from "./ui-static-s3";

export { MyWebAclConstructConstruct } from "./web-acl";
export { UiAssetDeployS3Construct } from "./ui-asset-deploy-s3";

interface MyCfDistributionProps extends ConstructProps {
  restApi: apigateway.RestApi;
  contextInfo: ContextInfo;
  stageName: string;
  // webAclId: string;
}

export class MyCfDistributionConstruct extends Construct {
  public readonly uiBucketArn: string;
  public readonly cfDistribution: cf.IDistribution;

  constructor(scope: Construct, id: string, props: MyCfDistributionProps) {
    super(scope, id);

    const uiS3 = new UiStaticS3Construct(this, "UiStaticS3Construct", {
      appId: props.appId,
      environment: props.environment,
      uiPathPrefix: props.contextInfo.cloudfront.pathPrefix.ui,
      errorsPathPrefix: props.contextInfo.cloudfront.pathPrefix.errors,
      homepagePath: props.contextInfo.cloudfront.homepageUrl
    });
    this.uiBucketArn = uiS3.uiBucket.bucketArn;

    const domainCf = new DomainCfConstruct(this, "DomainCfConstruct", {
      environment: props.environment,
      appId: props.appId,
      restApi: props.restApi,
      // webAclId: props.webAclId,
      uiBucket: uiS3.uiBucket,
      apiStageName: props.stageName,
      cfContext: props.contextInfo.cloudfront
    });
    this.cfDistribution = domainCf.cfDistribution;
  }
}
