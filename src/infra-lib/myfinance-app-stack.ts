import { Stack, StackProps } from "aws-cdk-lib";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import { Construct } from "constructs";
import { DBConstruct } from "./db";
import { ConstructProps, ContextInfo } from "./common";
import { ApiConstruct } from "./api-gateway";
import { ConfigS3Construct } from "./config-s3";
import { ReceiptS3Construct } from "./receipts-s3";
import { MyCfDistributionConstruct } from "./cf-distribution";
import { DeleteStackScheduleConstruct } from "./delete-schedule-eventbridge";

/*
 * https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
 */

/**
 * stack props
 */
interface MyFinanceAppStackProps extends StackProps, ConstructProps {
  // webAclId: string;
}

export class MyFinanceAppStack extends Stack {
  public readonly uiBucketArn: string;
  public readonly cfDistribution: cf.IDistribution;

  constructor(scope: Construct, id: string, props: MyFinanceAppStackProps) {
    super(scope, id, props);

    const contextInfo = this.node.tryGetContext(props.environment) as ContextInfo;

    const allDbs = new DBConstruct(this, "DatabaseConstruct", {
      environment: props.environment,
      appId: props.appId
    });

    const configS3 = new ConfigS3Construct(this, "ConfigS3Construct", {
      environment: props.environment,
      appId: props.appId
    });

    const receiptS3 = new ReceiptS3Construct(this, "ReceiptS3Construct", {
      environment: props.environment,
      appId: props.appId,
      expenseReceiptContext: contextInfo.expenseReceipt
    });

    const allApis = new ApiConstruct(this, "RestApiConstruct", {
      environment: props.environment,
      appId: props.appId,
      allDb: allDbs,
      apiContext: contextInfo.apigateway,
      restApiPathPrefix: contextInfo.cloudfront.pathPrefix.restApi,
      configBucket: configS3.configBucket,
      receiptS3: receiptS3,
      expenseReceiptContext: contextInfo.expenseReceipt
    });

    const cloudfrontDistribution = new MyCfDistributionConstruct(this, "MyCfDistributionConstruct", {
      environment: props.environment,
      appId: props.appId,
      restApi: allApis.restApi,
      contextInfo: contextInfo,
      stageName: allApis.stageName
      // webAclId: props.webAclId,
    });

    const deleteStackScheduler = new DeleteStackScheduleConstruct(this, "DeleteStackScheduleConstruct", {
      appId: props.appId,
      environment: props.environment,
      receiptS3: receiptS3.receiptBucket
    });

    this.uiBucketArn = cloudfrontDistribution.uiBucketArn;
    this.cfDistribution = cloudfrontDistribution.cfDistribution;
    // upload image, textextract to invoice details, retireve image
  }
}
