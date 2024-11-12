import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { AwsInfraEnvironment } from "./aws-infra-env.enum";
import { TableV2, AttributeType, TableClass } from "aws-cdk-lib/aws-dynamodb";
import { buildResourceName } from "./utils";
import { AwsResourceType } from "./props-type";

interface HelloCdkStackProps extends cdk.StackProps {
  infraEnv: AwsInfraEnvironment;
  appId: string;
}

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HelloCdkStackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    const queue = new sqs.Queue(this, "HelloCdkQueue", {
      queueName: buildResourceName(["hellocdk", "my", "first"], AwsResourceType.Sqs, props),
      visibilityTimeout: cdk.Duration.seconds(300),
    });

    const db = new TableV2(this, "DummyDynamoDb", {
      tableName: buildResourceName(["dummy"], AwsResourceType.Dynamodb, props),
      partitionKey: { name: "PK", type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: true,
      timeToLiveAttribute: "ExpiresAt",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
