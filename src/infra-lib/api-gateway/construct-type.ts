import { ConstructProps } from "../common";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export interface RestApiProps extends ConstructProps {
  layer: lambda.ILayerVersion;
  authorizer: apigateway.IAuthorizer;
  restApi: apigateway.RestApi;
  apiResource: apigateway.IResource;
  nodeJSRuntime: lambda.Runtime;
}
