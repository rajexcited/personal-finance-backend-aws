import { Construct } from "constructs";
import { EnvironmentType } from "./env-enum";
import { LambdaIntegration, RestApi, PassthroughBehavior, Model, Resource } from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";

interface OrderApiProps {
  environment: EnvironmentType;
  orderDb: TableV2;
}

type MethodType = "POST" | "PUT" | "DELETE" | "GET";

interface RequestParametersType {
  [param: string]: boolean;
}

export class OrderApiConstruct extends Construct {
  private readonly props: OrderApiProps;
  private readonly layer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: OrderApiProps) {
    super(scope, id);
    this.props = props;

    const restApi = new RestApi(this, "OrderRestApi", {
      restApiName: [props.environment, "orderlist", "get"].join("-"),
      deployOptions: {
        stageName: props.environment,
        description: "get orders history",
      },
    });

    this.layer = new lambda.LayerVersion(this, "OrderLambdaLayer", {
      layerVersionName: [props.environment, "order", "layer"].join("-"),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      code: lambda.AssetCode.fromAsset("./dist/"),
    });

    const orderListResource = restApi.root.addResource("orders");
    const orderResource = orderListResource.addResource("{orderId}");

    const getOrderListReqParams: RequestParametersType = {
      "method.request.querystring.page": true,
      "method.request.querystring.size": false,
    };
    let lambdaFunction = this.buildApi(orderListResource, "GET", "orders.getList", getOrderListReqParams);
    props.orderDb.grantReadData(lambdaFunction);
    lambdaFunction = this.buildApi(orderListResource, "POST", "orders.createItem");
    props.orderDb.grantWriteData(lambdaFunction);
    lambdaFunction = this.buildApi(orderResource, "GET", "orders.getItem");
    props.orderDb.grantReadData(lambdaFunction);
    lambdaFunction = this.buildApi(orderResource, "PUT", "orders.updateItem");
    props.orderDb.grantReadWriteData(lambdaFunction);
    lambdaFunction = this.buildApi(orderResource, "DELETE", "orders.deleteItem");
    props.orderDb.grantReadWriteData(lambdaFunction);
  }

  private buildApi(
    resource: Resource,
    method: MethodType,
    lambdaHandlerName: string,
    requestParameters?: RequestParametersType
  ) {
    const orderItemFunction = new lambda.Function(this, method + lambdaHandlerName.split(".").join("") + "Lambda", {
      functionName: [this.props.environment, ...lambdaHandlerName.split("."), method.toLowerCase()].join("-"),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: lambdaHandlerName,
      code: lambda.Code.fromAsset("./lambda-handlers"),
      layers: [this.layer],
      environment: {
        TABLE_NAME: this.props.orderDb.tableName,
      },
    });
    const orderItemLambdaIntegration = new LambdaIntegration(orderItemFunction, {
      proxy: true,
      passthroughBehavior: PassthroughBehavior.WHEN_NO_MATCH,
      integrationResponses: [{ statusCode: "200" }],
    });
    const orderItem = resource.addMethod(method, orderItemLambdaIntegration, {
      methodResponses: [{ statusCode: "200", responseModels: { "application/json": Model.EMPTY_MODEL } }],
      requestParameters,
    });
    return orderItemFunction;
  }
}
