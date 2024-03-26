import { Construct } from "constructs";
import { UserApiConstruct } from "./user-api-gateway";
import { ConstructProps } from "../common";
import { DBConstruct } from "../db";
import { LambdaLayerConstruct } from "./lambda-layer";
import { TokenAuthorizerConstruct } from "./authorizer-lambda";
import { IKey } from "aws-cdk-lib/aws-kms";

interface ApiProps extends ConstructProps {
  allDb: DBConstruct;
}

// https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-set-up-method-using-console.html
// setup api key to api gateway - so i can control which app can access api gateway and limit the calls / throttling, etc. hence improved costing
// https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html
export class ApiConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const lambdaLayer = new LambdaLayerConstruct(this, "LayerConstruct", props);
    const tokenAuthorizer = new TokenAuthorizerConstruct(this, "AccessTokenAuthConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
      layer: lambdaLayer.layer,
      userTable: props.allDb.userTable,
    });

    const userApi = new UserApiConstruct(this, "UserApiConstruct", {
      ...props,
      userTable: props.allDb.userTable,
      layer: lambdaLayer.layer,
      authorizer: tokenAuthorizer.authorizer,
      tokenSecret: tokenAuthorizer.tokenSecret,
    });
  }
}
