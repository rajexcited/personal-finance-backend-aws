import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ConstructProps, ContextInfo } from "./common";
import { MyWebAclConstructConstruct } from "./cf-distribution";

/*
 * https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
 */

/**
 * stack props
 */
interface MyFinanceWebAclAppStackProps extends StackProps, ConstructProps {}

export class MyFinanceWebAclAppStack extends Stack {
  public readonly webAclId: string;

  constructor(scope: Construct, id: string, props: MyFinanceWebAclAppStackProps) {
    super(scope, id, props);

    const contextInfo = this.node.tryGetContext(props.environment) as ContextInfo;

    if (contextInfo.cloudfront.enableWebAcl) {
      const webAcl = new MyWebAclConstructConstruct(this, "WebAclConstruct", {
        environment: props.environment,
        appId: props.appId,
      });
      this.webAclId = webAcl.arn;
    } else {
      this.webAclId = "not-created";
    }
  }
}
