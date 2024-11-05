import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";

interface HelloCdkStackProps extends cdk.StackProps {
  infraEnv: string;
}

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HelloCdkStackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    const queue = new sqs.Queue(this, "HelloCdkQueue", {
      queueName: ["hellocdk", "my", "first", props.infraEnv, "sqs"].join("-"),
      visibilityTimeout: cdk.Duration.seconds(300),
    });
  }
}
