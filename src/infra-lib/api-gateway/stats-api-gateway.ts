import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { DBConstruct } from "../db";
import { Duration } from "aws-cdk-lib";
import { EnvironmentName } from "../common";
import { BaseApiConstruct } from "./base-api";

interface StatsApiProps extends RestApiProps {
  allDb: DBConstruct;
}

enum StatsLambdaHandler {
  GetPurchaseStats = "index.purchaseStatsGet",
  GetRefundStats = "index.refundStatsGet",
  GetIncomeStats = "index.incomeStatsGet",
}

export class StatsApiConstruct extends BaseApiConstruct {
  constructor(scope: Construct, id: string, props: StatsApiProps) {
    super(scope, id, props);

    const statsResource = props.apiResource.addResource("stats");
    const statsQueryParams = { year: false };

    const purchaseResource = statsResource.addResource("purchase");
    const getPurchaseStatsLambdaFunction = this.buildApi(purchaseResource, HttpMethod.GET, StatsLambdaHandler.GetPurchaseStats, statsQueryParams);
    props.allDb.userTable.table.ref.grantReadData(getPurchaseStatsLambdaFunction);
    props.allDb.expenseTable.table.ref.grantReadData(getPurchaseStatsLambdaFunction);
    props.allDb.configTypeTable.table.ref.grantReadData(getPurchaseStatsLambdaFunction);
    props.allDb.paymentAccountTable.table.ref.grantReadData(getPurchaseStatsLambdaFunction);

    const refundResource = statsResource.addResource("refund");
    const getRefundStatsLambdaFunction = this.buildApi(refundResource, HttpMethod.GET, StatsLambdaHandler.GetRefundStats, statsQueryParams);
    props.allDb.userTable.table.ref.grantReadData(getRefundStatsLambdaFunction);
    props.allDb.expenseTable.table.ref.grantReadData(getRefundStatsLambdaFunction);
    props.allDb.configTypeTable.table.ref.grantReadData(getRefundStatsLambdaFunction);
    props.allDb.paymentAccountTable.table.ref.grantReadData(getRefundStatsLambdaFunction);

    const incomeResource = statsResource.addResource("income");
    const getIncomeStatsLambdaFunction = this.buildApi(incomeResource, HttpMethod.GET, StatsLambdaHandler.GetIncomeStats, statsQueryParams);
    props.allDb.userTable.table.ref.grantReadData(getIncomeStatsLambdaFunction);
    props.allDb.expenseTable.table.ref.grantReadData(getIncomeStatsLambdaFunction);
    props.allDb.configTypeTable.table.ref.grantReadData(getIncomeStatsLambdaFunction);
    props.allDb.paymentAccountTable.table.ref.grantReadData(getIncomeStatsLambdaFunction);
  }

  private buildApi(resource: apigateway.Resource, method: HttpMethod, lambdaHandlerName: StatsLambdaHandler, queryParams?: Record<string, boolean>) {
    const props = this.props as StatsApiProps;

    const lambdaFunction = new lambda.Function(this, this.getLambdaHandlerId(lambdaHandlerName, method), {
      functionName: this.getLambdaFunctionName(lambdaHandlerName, method),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: lambdaHandlerName,
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        USER_TABLE_NAME: props.allDb.userTable.table.name,
        CONFIG_TYPE_TABLE_NAME: props.allDb.configTypeTable.table.name,
        CONFIG_TYPE_BELONGS_TO_GSI_NAME: props.allDb.configTypeTable.globalSecondaryIndexes.userIdBelongsToIndex.name,
        PAYMENT_ACCOUNT_TABLE_NAME: props.allDb.paymentAccountTable.table.name,
        EXPENSES_TABLE_NAME: props.allDb.expenseTable.table.name,
        EXPENSE_USERID_STATUS_GSI_NAME: props.allDb.expenseTable.globalSecondaryIndexes.userIdStatusIndex.name,
        DEFAULT_LOG_LEVEL: this.props.environment === EnvironmentName.LOCAL ? "debug" : "undefined",
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.seconds(30),
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
    });

    const baseMethodOption = this.getRequestMethodOptions(lambdaHandlerName, resource, queryParams);

    const resourceMethod = resource.addMethod(String(method), lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: props.authorizer,
      ...baseMethodOption,
    });

    return lambdaFunction;
  }

  getJsonRequestModel(lambdaHandlerName: string) {
    return undefined;
  }
}
