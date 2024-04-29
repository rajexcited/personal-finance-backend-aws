import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { DbProps } from "../db";
import { Duration } from "aws-cdk-lib";
import { EnvironmentName } from "../common";
import { BaseApiConstruct } from "./base-api";

interface ExpenseReceiptsApiProps extends RestApiProps {
  userTable: DbProps;
  configTypeTable: DbProps;
  pymtAccTable: DbProps;
  expenseTable: DbProps;
  expensesResource: apigateway.Resource;
  expenseIdResource: apigateway.Resource;
}

export class ExpenseReceiptsApiConstruct extends BaseApiConstruct {
  private readonly props: ExpenseReceiptsApiProps;

  constructor(scope: Construct, id: string, props: ExpenseReceiptsApiProps) {
    super(scope, id);

    this.props = props;

    const receiptsResource = this.props.expenseIdResource.addResource("receipts");
    const receiptIdResource = receiptsResource.addResource("id").addResource("{receiptId}");

    //todo streaming proxy
    const addUpdateDetailsLambdaFunction = this.buildApi(receiptsResource, HttpMethod.POST, "index.receiptAdd");
    const getDetailsLambdaFunction = this.buildApi(receiptIdResource, HttpMethod.GET, "index.receiptGetDetails");
    const deleteDetailsLambdaFunction = this.buildApi(receiptIdResource, HttpMethod.DELETE, "index.receiptDeleteDetails");
  }

  private buildApi(resource: apigateway.Resource, method: HttpMethod, lambdaHandlerName: string) {
    const lambdaFunction = new lambda.Function(this, `${method}${lambdaHandlerName.replace("index.", "")}Lambda`, {
      functionName: [
        this.props.resourcePrefix,
        this.props.environment,
        ...lambdaHandlerName.split(".").slice(1),
        String(method).toLowerCase(),
        "func",
      ].join("-"),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: lambdaHandlerName,
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [this.props.layer],
      environment: {
        USER_TABLE_NAME: this.props.userTable.table.name,
        CONFIG_TYPE_TABLE_NAME: this.props.configTypeTable.table.name,
        CONFIG_TYPE_BELONGS_TO_GSI_NAME: this.props.configTypeTable.globalSecondaryIndexes.userIdBelongsToIndex.name,
        PAYMENT_ACCOUNT_TABLE_NAME: this.props.pymtAccTable.table.name,
        PAYMENT_ACCOUNT_USERID_GSI_NAME: this.props.pymtAccTable.globalSecondaryIndexes.userIdStatusShortnameIndex.name,
        EXPENSES_TABLE_NAME: this.props.expenseTable.table.name,
        DEFAULT_LOG_LEVEL: this.props.environment === EnvironmentName.LOCAL ? "debug" : "undefined",
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.seconds(30),
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
    });

    const resourceMethod = resource.addMethod(String(method), lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: this.props.authorizer,
      requestModels: undefined,
      requestValidatorOptions: { validateRequestBody: true, validateRequestParameters: true },
      requestParameters: this.getRequestParameters(resource),
    });

    return lambdaFunction;
  }
}
