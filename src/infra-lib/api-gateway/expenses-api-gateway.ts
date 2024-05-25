import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { DbProps } from "../db";
import { Duration } from "aws-cdk-lib";
import { EnvironmentName } from "../common";
import { BaseApiConstruct } from "./base-api";
import { ExpenseReceiptsApiConstruct } from "./expense-receipt-api-gateway";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { RECEIPT_KEY_PREFIX } from "../../lambda-handlers";

interface ExpensesApiProps extends RestApiProps {
  userTable: DbProps;
  configTypeTable: DbProps;
  pymtAccTable: DbProps;
  expenseTable: DbProps;
  receiptBucket: IBucket;
  receiptDeleteTags: Record<string, string>;
}

export class ExpenseApiConstruct extends BaseApiConstruct {
  private readonly props: ExpensesApiProps;

  constructor(scope: Construct, id: string, props: ExpensesApiProps) {
    super(scope, id);

    this.props = props;

    const expensesResource = this.props.restApi.root.addResource("expenses");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const requestQueryParams = {
      pageNo: true,
      status: false,
      pageCount: false,
      pageMonths: false,
    };
    const getListLambdaFunction = this.buildApi(expensesResource, HttpMethod.GET, "index.expenseList", requestQueryParams);
    props.userTable.table.ref.grantReadData(getListLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getListLambdaFunction);

    const addUpdateDetailsLambdaFunction = this.buildApi(expensesResource, HttpMethod.POST, "index.expenseAddUpdate");
    props.userTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.pymtAccTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(addUpdateDetailsLambdaFunction);
    props.receiptBucket.grantReadWrite(addUpdateDetailsLambdaFunction);

    const expenseIdResource = expensesResource.addResource("id").addResource("{expenseId}");
    const getDetailsLambdaFunction = this.buildApi(expenseIdResource, HttpMethod.GET, "index.expenseGetDetails");
    props.userTable.table.ref.grantReadData(getDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getDetailsLambdaFunction);

    // to schedule deletion. this action can be undone if delete time is not expired.
    const deleteDetailsLambdaFunction = this.buildApi(expenseIdResource, HttpMethod.DELETE, "index.expenseDeleteDetails");
    props.userTable.table.ref.grantReadData(deleteDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(deleteDetailsLambdaFunction);
    deleteDetailsLambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObjectTagging"],
        resources: [props.receiptBucket.arnForObjects([RECEIPT_KEY_PREFIX, "*"].join("/"))],
      })
    );

    // to allow to undo delete action if delete time limit is not expired.
    // if delete time is expired, scheduler will delete the expense along with receipt file and that cannot be undone.
    const statusResource = expenseIdResource.addResource("status").addResource("{status}");
    const updateStatusLambdaFunction = this.buildApi(statusResource, HttpMethod.POST, "index.expenseStatusUpdate");
    props.userTable.table.ref.grantReadData(updateStatusLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(updateStatusLambdaFunction);
    updateStatusLambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:DeleteObjectTagging"],
        resources: [props.receiptBucket.arnForObjects([RECEIPT_KEY_PREFIX, "*"].join("/"))],
      })
    );

    const receiptApi = new ExpenseReceiptsApiConstruct(this, "ExpenseReceiptsApiConstruct", {
      ...props,
      expenseIdResource: expenseIdResource,
    });
  }

  private buildApi(resource: apigateway.Resource, method: HttpMethod, lambdaHandlerName: string, queryParams?: Record<string, boolean>) {
    const additionalEnvs: Record<string, string> = {};
    if (lambdaHandlerName.endsWith("expenseAddUpdate")) {
      additionalEnvs.EXPENSE_RECEIPTS_BUCKET_NAME = this.props.receiptBucket.bucketName;
      additionalEnvs.CONFIG_TYPE_TABLE_NAME = this.props.configTypeTable.table.name;
      additionalEnvs.CONFIG_TYPE_BELONGS_TO_GSI_NAME = this.props.configTypeTable.globalSecondaryIndexes.userIdBelongsToIndex.name;
      additionalEnvs.PAYMENT_ACCOUNT_TABLE_NAME = this.props.pymtAccTable.table.name;
      additionalEnvs.PAYMENT_ACCOUNT_USERID_GSI_NAME = this.props.pymtAccTable.globalSecondaryIndexes.userIdStatusShortnameIndex.name;
    }
    if (lambdaHandlerName.endsWith("expenseStatusUpdate")) {
      additionalEnvs.EXPENSE_RECEIPTS_BUCKET_NAME = this.props.receiptBucket.bucketName;
    }
    if (lambdaHandlerName.endsWith("expenseDeleteDetails")) {
      additionalEnvs.EXPENSE_RECEIPTS_BUCKET_NAME = this.props.receiptBucket.bucketName;
      additionalEnvs.RECEIPT_S3_TAGS_TO_ADD = JSON.stringify(this.props.receiptDeleteTags);
      additionalEnvs.DELETE_EXPENSE_EXPIRES_IN_SEC = Duration.days(1).toSeconds().toString();
    }

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
        EXPENSES_TABLE_NAME: this.props.expenseTable.table.name,
        EXPENSE_USERID_DATE_GSI_NAME: this.props.expenseTable.globalSecondaryIndexes.userIdStatusDateIndex.name,
        DEFAULT_LOG_LEVEL: this.props.environment === EnvironmentName.LOCAL ? "debug" : "undefined",
        ...additionalEnvs,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.seconds(30),
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
    });

    const resourceMethod = resource.addMethod(String(method), lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: this.props.authorizer,
      requestModels: lambdaHandlerName.includes("expenseAddUpdate") ? { "application/json": this.getAddUpdateDetailModel() } : undefined,
      requestValidatorOptions: { validateRequestBody: true, validateRequestParameters: true },
      requestParameters: this.getRequestParameters(resource, queryParams),
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
        required: ["billName", "purchasedDate", "tags", "receipts", "expenseItems"],
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
              required: ["name", "contenttype"],
              properties: {
                id: { ref: "#/definitions/uuid" },
                name: {
                  type: apigateway.JsonSchemaType.STRING,
                  maxLength: 50,
                  pattern: "[\\w\\s-+\\.,@#$%^&]+",
                },
                contenttype: {
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
