import { ConstructProps } from "../common";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export interface RestApiProps extends ConstructProps {
  layer: lambda.ILayerVersion;
  authorizer: apigateway.IAuthorizer;
  tokenSecret: secretsmanager.Secret;
  restApi: apigateway.RestApi;
}

export interface RequestParameters {
  [param: string]: boolean;
}
