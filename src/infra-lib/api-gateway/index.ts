import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { UserApiConstruct } from "./user-api-gateway";
import { AwsResourceType, ConstructProps, buildResourceName, ApigatewayContextInfo, ExpenseReceiptContextInfo } from "../common";
import { DBConstruct } from "../db";
import { LambdaLayerConstruct } from "./lambda-layer";
import { TokenAuthorizerConstruct } from "./authorizer-lambda";
import { ConfigTypeApiConstruct } from "./config-types-api-gateway";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { PymtAccApiConstruct } from "./pymt-acc-api-gateway";
import { ExpenseApiConstruct } from "./expenses";
import { ReceiptS3Construct } from "../receipts-s3";
import { StatsApiConstruct } from "./stats-api-gateway";
import { AuthSecretConstruct } from "./auth-secret";

interface ApiProps extends ConstructProps {
  allDb: DBConstruct;
  apiContext: ApigatewayContextInfo;
  restApiPathPrefix: string;
  configBucket: IBucket;
  receiptS3: ReceiptS3Construct;
  expenseReceiptContext: ExpenseReceiptContextInfo;
}

// https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-set-up-method-using-console.html
// setup api key to api gateway - so i can control which app can access api gateway and limit the calls / throttling, etc. hence improved costing
// https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html
export class ApiConstruct extends Construct {
  public readonly restApi: apigateway.RestApi;
  public readonly stageName: string;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const lambdaLayer = new LambdaLayerConstruct(this, "LayerConstruct", props);
    const authSecret = new AuthSecretConstruct(this, "AuthSecretConstruct", {
      appId: props.appId,
      environment: props.environment,
      layer: lambdaLayer.layer,
      secretRotatingDuration: props.apiContext.secretRotatingDuration,
    });

    const tokenAuthorizer = new TokenAuthorizerConstruct(this, "AccessTokenAuthConstruct", {
      environment: props.environment,
      appId: props.appId,
      layer: lambdaLayer.layer,
      userTable: props.allDb.userTable,
      restApiPathPrefix: props.restApiPathPrefix,
      tokenSecret: authSecret.secret,
    });

    this.stageName = [props.environment, "stage", "api"].join("-");
    const restApi = new apigateway.RestApi(this, "MyFinanceRestApi", {
      restApiName: buildResourceName(["backend"], AwsResourceType.RestApi, props),
      binaryMediaTypes: ["*/*"],
      deployOptions: {
        stageName: this.stageName,
        description: "my personal finance rest apis",
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        // accessLogDestination: new apigateway.LogGroupLogDestination(
        //   new LogGroup(this, "RestApiAccessLogGroup", {
        //     // logGroupName: "apigateway/restapi/accesslogs",
        //     retention: RetentionDays.ONE_WEEK,
        //   })
        // ),
      },
    });
    this.restApi = restApi;

    const apiResource = props.restApiPathPrefix
      .split("/")
      .filter((path) => path)
      .reduce((prevRsc, path) => prevRsc.addResource(path), restApi.root);

    const userApi = new UserApiConstruct(this, "UserApiConstruct", {
      environment: props.environment,
      appId: props.appId,
      configBucket: props.configBucket,
      userTable: props.allDb.userTable,
      configTypeTable: props.allDb.configTypeTable,
      paymentAccountTable: props.allDb.paymentAccountTable,
      layer: lambdaLayer.layer,
      authorizer: tokenAuthorizer.authorizer,
      authSecret: authSecret.secret,
      restApi: restApi,
      apiResource: apiResource,
      deleteExpiration: props.apiContext.deleteUserExpiration,
    });

    const configTypeApi = new ConfigTypeApiConstruct(this, "ConfigTypeApiConstruct", {
      environment: props.environment,
      appId: props.appId,
      configBucket: props.configBucket,
      userTable: props.allDb.userTable,
      configTypeTable: props.allDb.configTypeTable,
      layer: lambdaLayer.layer,
      authorizer: tokenAuthorizer.authorizer,
      restApi: restApi,
      apiResource: apiResource,
    });

    const pymtAccApi = new PymtAccApiConstruct(this, "PymtAccApiConstruct", {
      environment: props.environment,
      appId: props.appId,
      userTable: props.allDb.userTable,
      configTypeTable: props.allDb.configTypeTable,
      pymtAccTable: props.allDb.paymentAccountTable,
      layer: lambdaLayer.layer,
      authorizer: tokenAuthorizer.authorizer,
      restApi: restApi,
      apiResource: apiResource,
    });

    const expenseApi = new ExpenseApiConstruct(this, "ExpenseApiConstruct", {
      environment: props.environment,
      appId: props.appId,
      layer: lambdaLayer.layer,
      authorizer: tokenAuthorizer.authorizer,
      restApi: restApi,
      apiResource: apiResource,
      allDb: props.allDb,
      expenseReceiptContext: props.expenseReceiptContext,
      receiptBucket: props.receiptS3.receiptBucket,
    });

    const statApi = new StatsApiConstruct(this, "StatsApiConstruct", {
      environment: props.environment,
      appId: props.appId,
      layer: lambdaLayer.layer,
      authorizer: tokenAuthorizer.authorizer,
      restApi: restApi,
      apiResource: apiResource,
      allDb: props.allDb,
    });
  }
}
