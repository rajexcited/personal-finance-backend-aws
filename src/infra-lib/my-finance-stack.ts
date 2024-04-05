import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DBConstruct } from "./db";
import { ConstructProps } from "./common";
import { ApiConstruct } from "./api-gateway";
import { ContextInfo } from "./context-type";
import { ConfigS3Construct } from "./config-s3";

/*
 * https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
 */

/**
 * stack props
 */
interface AppStackProps extends StackProps, ConstructProps {}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const contextInfo = this.node.tryGetContext(props.environment) as ContextInfo;

    const allDbs = new DBConstruct(this, "DatabaseConstruct", { ...props });
    const configS3 = new ConfigS3Construct(this, "ConfigS3Construct", { ...props });
    const allApis = new ApiConstruct(this, "RestApiConstruct", {
      ...props,
      allDb: allDbs,
      contextInfo: contextInfo,
      configBucket: configS3.configBucket,
    });

    // upload image, textextract to invoice details, retireve image
    // public url, secured url
  }
}
