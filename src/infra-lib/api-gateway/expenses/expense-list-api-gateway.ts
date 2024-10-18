import { Construct } from "constructs";
import { RestApiProps } from "../construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { ConfigDbProps, ExpenseDbProps, UserDbProps } from "../../db";
import { Duration } from "aws-cdk-lib";
import { EnvironmentName } from "../../common";
import { BaseApiConstruct } from "../base-api";

interface ExpenseListApiProps extends RestApiProps {
  userTable: UserDbProps;
  expenseTable: ExpenseDbProps;
  expenseResource: apigateway.Resource;
  configTypeTable: ConfigDbProps;
}

enum ExpenseListLambdaHandler {
  GetList = "index.expenseListGet",
  GetCount = "index.expenseCountGet",
}

export class ExpenseListApiConstruct extends BaseApiConstruct {
  constructor(scope: Construct, id: string, props: ExpenseListApiProps) {
    super(scope, id, props);

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const getListRequestQueryParams = {
      pageNo: true,
      status: false,
      pageMonths: false,
      belongsTo: false,
    };
    const getListLambdaFunction = this.buildApi(props.expenseResource, HttpMethod.GET, ExpenseListLambdaHandler.GetList, getListRequestQueryParams);
    props.userTable.table.ref.grantReadData(getListLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getListLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(getListLambdaFunction);

    const expenseCountResource = props.expenseResource.addResource("count");
    const getCountLambdaFunction = this.buildApi(expenseCountResource, HttpMethod.GET, ExpenseListLambdaHandler.GetCount, getListRequestQueryParams);
    props.userTable.table.ref.grantReadData(getCountLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getCountLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(getCountLambdaFunction);
  }

  private buildApi(
    resource: apigateway.Resource,
    method: HttpMethod,
    lambdaHandlerName: ExpenseListLambdaHandler,
    queryParams: Record<string, boolean>
  ) {
    const props = this.props as ExpenseListApiProps;

    const lambdaFunction = new lambda.Function(this, this.getLambdaHandlerId(lambdaHandlerName, method), {
      functionName: this.getLambdaFunctionName(lambdaHandlerName, method),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: lambdaHandlerName,
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        USER_TABLE_NAME: props.userTable.table.name,
        EXPENSES_TABLE_NAME: props.expenseTable.table.name,
        EXPENSE_USERID_STATUS_GSI_NAME: props.expenseTable.globalSecondaryIndexes.userIdStatusIndex.name,
        CONFIG_TYPE_TABLE_NAME: props.configTypeTable.table.name,
        CONFIG_TYPE_BELONGS_TO_GSI_NAME: props.configTypeTable.globalSecondaryIndexes.userIdBelongsToIndex.name,
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

  getJsonRequestModel(lambdaHandlerName: string): apigateway.Model | undefined {
    return undefined;
  }
}
