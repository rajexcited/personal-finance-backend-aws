import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { DbProps } from "../db";
import { Duration } from "aws-cdk-lib";
import { ConfigStatus } from "../../lambda-handlers";
import { EnvironmentName } from "../common";
import { BaseApiConstruct } from "./base-api";

interface ExpensesApiProps extends RestApiProps {
  userTable: DbProps;
  configTypeTable: DbProps;
  pymtAccTable: DbProps;
  expenseTable: DbProps;
}

export class ExpenseApiConstruct extends BaseApiConstruct {
  private readonly props: ExpensesApiProps;

  constructor(scope: Construct, id: string, props: ExpensesApiProps) {
    super(scope, id);

    this.props = props;

    const expensesResource = this.props.restApi.root.addResource("expenses");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const getListLambdaFunction = this.buildApi(expensesResource, HttpMethod.GET, "index.expenseList");
    props.userTable.table.ref.grantReadData(getListLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getListLambdaFunction);

    const addUpdateDetailsLambdaFunction = this.buildApi(expensesResource, HttpMethod.POST, "index.expenseAddUpdate");
    props.userTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.pymtAccTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(addUpdateDetailsLambdaFunction);

    const expenseIdResource = expensesResource.addResource("id").addResource("{expenseId}");
    const getDetailsLambdaFunction = this.buildApi(expenseIdResource, HttpMethod.GET, "index.expenseGetDetails");
    props.userTable.table.ref.grantReadData(getDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getDetailsLambdaFunction);

    const deleteDetailsLambdaFunction = this.buildApi(expenseIdResource, HttpMethod.DELETE, "index.expenseDeleteDetails");
    props.userTable.table.ref.grantReadData(deleteDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(deleteDetailsLambdaFunction);

    const statusResource = expenseIdResource.addResource("status").addResource("{status}");
    const updateStatusLambdaFunction = this.buildApi(statusResource, HttpMethod.POST, "index.expenseStatusUpdate");
    props.userTable.table.ref.grantReadData(updateStatusLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(updateStatusLambdaFunction);

    // const receiptApi = new ExpenseReceiptsApiConstruct(this, "", {
    //   ...props,
    //   expensesResource: expensesResource,
    //   expenseIdResource: expenseIdResource,
    // });
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
        EXPENSE_USERID_DATE_GSI_NAME: this.props.expenseTable.globalSecondaryIndexes.userIdStatusDateIndex.name,
        DEFAULT_LOG_LEVEL: this.props.environment === EnvironmentName.LOCAL ? "debug" : "undefined",
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.seconds(30),
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
    });

    let reqParam: Record<string, boolean> = {};
    if (lambdaHandlerName.includes("expenseList")) {
      reqParam.pageNo = true;
    }
    const resourceMethod = resource.addMethod(String(method), lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: this.props.authorizer,
      requestModels: lambdaHandlerName.includes("expenseAddUpdate") ? { "application/json": this.getAddUpdateDetailModel() } : undefined,
      requestValidatorOptions: { validateRequestBody: true, validateRequestParameters: true },
      requestParameters: this.getRequestParameters(resource, reqParam),
    });

    return lambdaFunction;
  }

  private getAddUpdateDetailModel = () => {
    const model: apigateway.Model = this.props.restApi.addModel("ExpenseAddUpdateDetailModel", {
      contentType: "application/json",
      description: "add update expense details model",
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT7,
        title: "Expense Detail Schema",
        type: apigateway.JsonSchemaType.OBJECT,
        required: ["billName", "purchasedDate", "tags"],
        properties: {
          id: { ref: "#/definitions/uuid" },
          billName: { ref: "#/definitions/billName" },
          amount: { ref: "#/definitions/amount" },
          purchasedDate: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 10,
          },
          verifiedTimestamp: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 24,
          },
          paymentAccountId: { ref: "#/definitions/uuid" },
          expenseCategoryId: { ref: "#/definitions/uuid" },
          description: { ref: "#/definitions/description" },
          tags: { ref: "#/definitions/tags" },
          status: {
            type: apigateway.JsonSchemaType.STRING,
            enum: ["enable"],
          },
          receipts: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: {
              type: apigateway.JsonSchemaType.OBJECT,
              required: ["id", "type"],
              properties: {
                id: { ref: "#/definitions/uuid" },
                type: {
                  type: apigateway.JsonSchemaType.STRING,
                  enum: ["image/png", "image/jpeg", "application/pdf"],
                },
              },
            },
          },
          expenseItems: {
            type: apigateway.JsonSchemaType.ARRAY,
            items: {
              type: apigateway.JsonSchemaType.OBJECT,
              required: ["billName", "tags"],
              properties: {
                id: { ref: "#/definitions/uuid" },
                billName: { ref: "#/definitions/billName" },
                amount: { ref: "#/definitions/amount" },
                expenseCategoryId: { ref: "#/definitions/uuid" },
                tags: { ref: "#/definitions/tags" },
                description: { ref: "#/definitions/description" },
              },
            },
          },
        },
        definitions: {
          uuid: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 36,
          },
          billName: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 50,
            pattern: "[\\w\\s\\.@#\\$&\\+!-]+",
          },
          amount: {
            type: apigateway.JsonSchemaType.STRING,
            multipleOf: 0.01,
          },
          description: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 200,
            pattern: "[\\w\\s\\.,<>\\?\\/'\";:\\{\\}\\[\\]|\\\\`~!@#\\$%\\^&\\*\\(\\)\\+=-\\Sc]+",
          },
          tags: {
            type: apigateway.JsonSchemaType.ARRAY,
            maxItems: 10,
            items: {
              type: apigateway.JsonSchemaType.STRING,
              maxLength: 15,
              pattern: "^[\\w\\.-]+$",
            },
          },
        },
      },
    });
    return model;
  };
}
