import { Construct } from "constructs";
import { ConstructProps } from "../common";
import * as lambda from "aws-cdk-lib/aws-lambda";

export class LambdaLayerConstruct extends Construct {
  public readonly layer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    this.layer = new lambda.LayerVersion(this, "LambdaLayer", {
      layerVersionName: [props.resourcePrefix, props.environment, "layer"].join("-"),
      compatibleRuntimes: [lambda.Runtime.NODEJS_LATEST],
      // asset path is relative to project
      code: lambda.AssetCode.fromAsset("dist/lambda_layer/"),
    });
  }
}
