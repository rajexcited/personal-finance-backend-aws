import { AwsInfraEnvironment } from "./aws-infra-env.enum";

export interface ConstructProps {
  infraEnv: AwsInfraEnvironment;
  appId: string;
}

export enum AwsResourceType {
  Dynamodb = "dynamodb",
  GlobalSecondaryIndex = "gsi",
  S3Bucket = "s3-bucket",
  BucketDeployment = "bucket-deploy",
  Lambda = "lambda-func",
  LambdaLayer = "lambda-layer",
  SecretManager = "secret",
  TokenAuthorizer = "token-authorizer",
  RestApi = "rest-api",
  ApiModel = "model",
  IamRole = "role",
  ExecutionIamRole = "exec-role",
  Metric = "metric",
  CloudFrontFunction = "cf-function",
  CftOutput = "cft-output",
  Sqs = "sqs",
  Stack = "stack",
}
