import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DBConstruct } from "./db";
import { ConstructProps, ContextInfo } from "./common";
import { ApiConstruct } from "./api-gateway";
import { ConfigS3Construct } from "./config-s3";
import { ReceiptS3Construct } from "./receipts-s3";
import { MyCfDistributionConstruct } from "./cf-distribution";

/*
 * https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
 */

/**
 * stack props
 */
interface MyFinanceAppStackProps extends StackProps, ConstructProps {
  webAclId: string;
}

export class MyFinanceAppStack extends Stack {
  public readonly uiBucketArn: string;

  constructor(scope: Construct, id: string, props: MyFinanceAppStackProps) {
    super(scope, id, props);

    const contextInfo = this.node.tryGetContext(props.environment) as ContextInfo;

    const allDbs = new DBConstruct(this, "DatabaseConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
    });

    const configS3 = new ConfigS3Construct(this, "ConfigS3Construct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
    });

    const receiptS3 = new ReceiptS3Construct(this, "ReceiptS3Construct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
      expenseReceiptContext: contextInfo.expenseReceipt,
    });

    const allApis = new ApiConstruct(this, "RestApiConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
      allDb: allDbs,
      apiContext: contextInfo.apigateway,
      restApiPathPrefix: contextInfo.cloudfront.pathPrefix.restApi,
      configBucket: configS3.configBucket,
      receiptS3: receiptS3,
      expenseReceiptContext: contextInfo.expenseReceipt,
    });

    const cfDistribution = new MyCfDistributionConstruct(this, "MyCfDistributionConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
      restApi: allApis.restApi,
      contextInfo: contextInfo,
      webAclId: props.webAclId,
    });

    this.uiBucketArn = cfDistribution.uiBucketArn;
    // upload image, textextract to invoice details, retireve image
  }
}
