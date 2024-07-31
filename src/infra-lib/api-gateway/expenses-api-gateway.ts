import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { ConfigDbProps, ExpenseDbProps, PymtAccDbProps, UserDbProps } from "../db";
import { Duration } from "aws-cdk-lib";
import { EnvironmentName, ExpenseReceiptContextInfo } from "../common";
import { BaseApiConstruct } from "./base-api";
import { ExpenseReceiptsApiConstruct } from "./expense-receipt-api-gateway";
import { IBucket } from "aws-cdk-lib/aws-s3";

interface ExpensesApiProps extends RestApiProps {
  userTable: UserDbProps;
  configTypeTable: ConfigDbProps;
  pymtAccTable: PymtAccDbProps;
  expenseTable: ExpenseDbProps;
  receiptBucket: IBucket;
  expenseReceiptContext: ExpenseReceiptContextInfo;
}

enum ExpenseLambdaHandler {
  GetList = "index.expenseList",
  AddUpdate = "index.expenseAddUpdate",
  GetCount = "index.expenseCount",
  GetTagList = "index.expenseTagList",
  GetItem = "index.expenseGetDetails",
  DeleteItem = "index.expenseDeleteDetails",
  UpdateStatus = "index.expenseStatusUpdate",
}

export class ExpenseApiConstruct extends BaseApiConstruct {
  constructor(scope: Construct, id: string, props: ExpensesApiProps) {
    super(scope, id, props);

    const expensesResource = props.apiResource.addResource("expenses");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const getListRequestQueryParams = {
      pageNo: true,
      status: false,
      pageCount: false,
      pageMonths: false,
    };
    const getListLambdaFunction = this.buildApi(expensesResource, HttpMethod.GET, ExpenseLambdaHandler.GetList, getListRequestQueryParams);
    props.userTable.table.ref.grantReadData(getListLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getListLambdaFunction);

    const getCountRequestQueryParams = {
      pageNo: true,
      status: false,
      pageMonths: false,
    };
    const expenseCountResource = expensesResource.addResource("count");
    const getCountLambdaFunction = this.buildApi(expenseCountResource, HttpMethod.GET, ExpenseLambdaHandler.GetCount, getCountRequestQueryParams);
    props.userTable.table.ref.grantReadData(getCountLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getCountLambdaFunction);

    const addUpdateDetailsLambdaFunction = this.buildApi(expensesResource, HttpMethod.POST, ExpenseLambdaHandler.AddUpdate);
    props.userTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.pymtAccTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(addUpdateDetailsLambdaFunction);
    props.receiptBucket.grantReadWrite(addUpdateDetailsLambdaFunction);

    const expenseTagResource = expensesResource.addResource("tags");
    const getTagsLambdaFunction = this.buildApi(expenseTagResource, HttpMethod.GET, ExpenseLambdaHandler.GetTagList, { purchasedYear: true });
    props.expenseTable.table.ref.grantReadData(getTagsLambdaFunction);

    const expenseIdResource = expensesResource.addResource("id").addResource("{expenseId}");
    const getDetailsLambdaFunction = this.buildApi(expenseIdResource, HttpMethod.GET, ExpenseLambdaHandler.GetItem);
    props.userTable.table.ref.grantReadData(getDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getDetailsLambdaFunction);

    // to schedule deletion. this action can be undone if delete time is not expired.
    const deleteDetailsLambdaFunction = this.buildApi(expenseIdResource, HttpMethod.DELETE, ExpenseLambdaHandler.DeleteItem);
    props.userTable.table.ref.grantReadData(deleteDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(deleteDetailsLambdaFunction);
    deleteDetailsLambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObjectTagging"],
        resources: [props.receiptBucket.arnForObjects(props.expenseReceiptContext.finalizeReceiptKeyPrefix + "*")],
      })
    );

    // to allow to undo delete action if delete time limit is not expired.
    // if delete time is expired, scheduler will delete the expense along with receipt file and that cannot be undone.
    const statusResource = expenseIdResource.addResource("status").addResource("{status}");
    const updateStatusLambdaFunction = this.buildApi(statusResource, HttpMethod.POST, ExpenseLambdaHandler.UpdateStatus);
    props.userTable.table.ref.grantReadData(updateStatusLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(updateStatusLambdaFunction);
    updateStatusLambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:DeleteObjectTagging"],
        resources: [props.receiptBucket.arnForObjects(props.expenseReceiptContext.finalizeReceiptKeyPrefix + "*")],
      })
    );

    const receiptApi = new ExpenseReceiptsApiConstruct(this, "ExpenseReceiptsApiConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
      restApi: props.restApi,
      apiResource: props.apiResource,
      layer: props.layer,
      authorizer: props.authorizer,
      receiptBucket: props.receiptBucket,
      expenseIdResource: expenseIdResource,
      expenseReceiptContext: props.expenseReceiptContext,
    });
  }

  private buildApi(
    resource: apigateway.Resource,
    method: HttpMethod,
    lambdaHandlerName: ExpenseLambdaHandler,
    queryParams?: Record<string, boolean>
  ) {
    const props = this.props as ExpensesApiProps;
    const additionalEnvs: Record<string, string> = {};

    if (lambdaHandlerName === ExpenseLambdaHandler.AddUpdate) {
      additionalEnvs.EXPENSE_RECEIPTS_BUCKET_NAME = props.receiptBucket.bucketName;
      additionalEnvs.CONFIG_TYPE_TABLE_NAME = props.configTypeTable.table.name;
      additionalEnvs.CONFIG_TYPE_BELONGS_TO_GSI_NAME = props.configTypeTable.globalSecondaryIndexes.userIdBelongsToIndex.name;
      additionalEnvs.PAYMENT_ACCOUNT_TABLE_NAME = props.pymtAccTable.table.name;
      additionalEnvs.PAYMENT_ACCOUNT_USERID_GSI_NAME = props.pymtAccTable.globalSecondaryIndexes.userIdStatusShortnameIndex.name;
    }
    if (lambdaHandlerName === ExpenseLambdaHandler.UpdateStatus) {
      additionalEnvs.EXPENSE_RECEIPTS_BUCKET_NAME = props.receiptBucket.bucketName;
    }
    if (lambdaHandlerName === ExpenseLambdaHandler.DeleteItem) {
      additionalEnvs.EXPENSE_RECEIPTS_BUCKET_NAME = props.receiptBucket.bucketName;
      additionalEnvs.RECEIPT_S3_TAGS_TO_ADD = JSON.stringify(props.expenseReceiptContext.deleteTags);
      additionalEnvs.DELETE_EXPENSE_EXPIRES_IN_SEC = Duration.days(props.expenseReceiptContext.expirationDays.finalizeReceipt).toSeconds().toString();
    }

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
        EXPENSE_USERID_DATE_GSI_NAME: props.expenseTable.globalSecondaryIndexes.userIdStatusDateIndex.name,
        RECEIPT_KEY_PREFIX: props.expenseReceiptContext.finalizeReceiptKeyPrefix.split("/")[0],
        RECEIPT_TEMP_KEY_PREFIX: props.expenseReceiptContext.temporaryKeyPrefix.split("/")[0],
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

    const baseMethodOption = this.getRequestMethodOptions(lambdaHandlerName, resource, queryParams);

    const resourceMethod = resource.addMethod(String(method), lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: props.authorizer,
      ...baseMethodOption,
    });

    return lambdaFunction;
  }

  getJsonRequestModel(lambdaHandlerName: string): apigateway.Model | undefined {
    if (lambdaHandlerName === ExpenseLambdaHandler.AddUpdate) {
      return this.getAddUpdateDetailModel();
    }
    return undefined;
  }

  private getAddUpdateDetailModel = () => {
    const props = this.props as RestApiProps;
    const model: apigateway.Model = props.restApi.addModel("ExpenseAddUpdateDetailModel", {
      modelName: "ExpenseAddUpdateDetailModel",
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
