import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { AwsInfraEnvironment } from "./aws-infra-env.enum";
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

    const db = new dynamodb.Table(this, "DummyDynamoDb", {
      tableName: buildResourceName(["dummy"], AwsResourceType.Dynamodb, props),
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
      // pointInTimeRecovery: true,
      timeToLiveAttribute: "ExpiresAt",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
