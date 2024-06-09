import { EnvironmentName } from "./env-enum";

export interface ConstructProps {
  environment: EnvironmentName;
  resourcePrefix: "myfinance";
}

export enum AwsResourceType {
  Dynamodb = "dynamodb",
  GlobalSecondaryIndex = "gsi",
  S3Bucket = "s3-bucket",
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
}
