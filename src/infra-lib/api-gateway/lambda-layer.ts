import { Construct } from "constructs";
import { AwsResourceType, ConstructProps, buildResourceName } from "../common";
import * as lambda from "aws-cdk-lib/aws-lambda";

interface LambdaLayerProps extends ConstructProps {
  nodeJSRuntime: lambda.Runtime;
}

export class LambdaLayerConstruct extends Construct {
  public readonly layer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: LambdaLayerProps) {
    super(scope, id);

    this.layer = new lambda.LayerVersion(this, "LambdaLayer", {
      layerVersionName: buildResourceName(["api"], AwsResourceType.LambdaLayer, props),
      compatibleRuntimes: [props.nodeJSRuntime],
      // asset path is relative to project
      code: lambda.AssetCode.fromAsset("dist/lambda_layer/")
    });
  }
}
