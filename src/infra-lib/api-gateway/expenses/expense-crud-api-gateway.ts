import { Construct } from "constructs";
import { RestApiProps } from "../construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { ConfigDbProps, ExpenseDbProps, PymtAccDbProps, UserDbProps } from "../../db";
import { Duration } from "aws-cdk-lib";
import { InfraEnvironmentId, ExpenseReceiptContextInfo } from "../../common";
import { BaseApiConstruct, getTagsRequestQueryParams } from "../base-api";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { ReceiptsApiConstruct } from "./receipt-api-gateway";
import { ExpenseBelongsTo } from "../../../lambda-handlers/expenses/base-config";
import { parsedDuration } from "../../common/utils";

interface ExpenseCrudApiProps extends RestApiProps {
  userTable: UserDbProps;
  configTypeTable: ConfigDbProps;
  pymtAccTable: PymtAccDbProps;
  expenseTable: ExpenseDbProps;
  receiptBucket: IBucket;
  expenseReceiptContext: ExpenseReceiptContextInfo;
  expenseResource: apigateway.Resource;
}

enum ExpenseCrudLambdaHandler {
  GetTagList = "index.expenseTagListGet",
  GetItem = "index.expenseDetailsGet",
  AddUpdate = "index.expenseDetailsAddUpdate",
  DeleteItem = "index.expenseDetailsDelete",
  UpdateStatus = "index.expenseStatusUpdate",
}

export class ExpenseCrudApiConstruct extends BaseApiConstruct {
  constructor(scope: Construct, id: string, props: ExpenseCrudApiProps) {
    super(scope, id, props);

    const belongsToList = [ExpenseBelongsTo.Purchase, ExpenseBelongsTo.Income, ExpenseBelongsTo.Refund];

    const belongsToResource = props.expenseResource.addResource("{belongsTo}");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html

    const addUpdateDetailsLambdaFunction = this.buildApi(belongsToResource, HttpMethod.POST, ExpenseCrudLambdaHandler.AddUpdate);
    props.userTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.pymtAccTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(addUpdateDetailsLambdaFunction);

    belongsToList.forEach((prefix) => {
      const finalizeReceiptKeyPrefix = props.expenseReceiptContext.finalizeReceiptKeyPrefix + prefix + "/*";
      const temporaryKeyPrefix = props.expenseReceiptContext.temporaryKeyPrefix + prefix + "/*";
      props.receiptBucket.grantReadWrite(addUpdateDetailsLambdaFunction, finalizeReceiptKeyPrefix);
      props.receiptBucket.grantReadWrite(addUpdateDetailsLambdaFunction, temporaryKeyPrefix);
    });

    const expenseTagResource = belongsToResource.addResource("tags");
    const getTagsLambdaFunction = this.buildApi(expenseTagResource, HttpMethod.GET, ExpenseCrudLambdaHandler.GetTagList, getTagsRequestQueryParams);
    props.expenseTable.table.ref.grantReadData(getTagsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(getTagsLambdaFunction);

    const expenseIdResource = belongsToResource.addResource("id").addResource("{expenseId}");
    const getDetailsLambdaFunction = this.buildApi(expenseIdResource, HttpMethod.GET, ExpenseCrudLambdaHandler.GetItem);
    props.userTable.table.ref.grantReadData(getDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadData(getDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(getDetailsLambdaFunction);

    // to schedule deletion. this action can be undone if delete time is not expired.
    const deleteDetailsLambdaFunction = this.buildApi(expenseIdResource, HttpMethod.DELETE, ExpenseCrudLambdaHandler.DeleteItem);
    props.userTable.table.ref.grantReadData(deleteDetailsLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(deleteDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(deleteDetailsLambdaFunction);
    const permittedDeleteResources = belongsToList.map((prefix) => {
      const finalizeReceiptKeyPrefix = props.expenseReceiptContext.finalizeReceiptKeyPrefix + prefix + "/*";
      return props.receiptBucket.arnForObjects(finalizeReceiptKeyPrefix);
    });
    deleteDetailsLambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObjectTagging"],
        resources: permittedDeleteResources,
      })
    );

    // to allow to undo delete action if delete time limit is not expired.
    // if delete time is expired, scheduler will delete the expense along with receipt file and that cannot be undone.
    const statusResource = expenseIdResource.addResource("status").addResource("{status}");
    const updateStatusLambdaFunction = this.buildApi(statusResource, HttpMethod.POST, ExpenseCrudLambdaHandler.UpdateStatus);
    props.userTable.table.ref.grantReadData(updateStatusLambdaFunction);
    props.expenseTable.table.ref.grantReadWriteData(updateStatusLambdaFunction);
    updateStatusLambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:DeleteObjectTagging"],
        resources: permittedDeleteResources,
      })
    );

    const receiptApi = new ReceiptsApiConstruct(this, "ReceiptsApiConstruct", {
      environment: props.environment,
      appId: props.appId,
      restApi: props.restApi,
      apiResource: props.apiResource,
      layer: props.layer,
      authorizer: props.authorizer,
      receiptBucket: props.receiptBucket,
      resource: expenseIdResource,
      receiptContext: props.expenseReceiptContext,
    });
  }

  private buildApi(
    resource: apigateway.Resource,
    method: HttpMethod,
    lambdaHandlerName: ExpenseCrudLambdaHandler,
    queryParams?: Record<string, boolean>
  ) {
    const props = this.props as ExpenseCrudApiProps;
    const additionalEnvs: Record<string, string> = {};

    if (lambdaHandlerName === ExpenseCrudLambdaHandler.AddUpdate) {
      additionalEnvs.EXPENSE_RECEIPTS_BUCKET_NAME = props.receiptBucket.bucketName;
      additionalEnvs.PAYMENT_ACCOUNT_TABLE_NAME = props.pymtAccTable.table.name;
      additionalEnvs.PAYMENT_ACCOUNT_USERID_GSI_NAME = props.pymtAccTable.globalSecondaryIndexes.userIdStatusShortnameIndex.name;
    }
    if (lambdaHandlerName === ExpenseCrudLambdaHandler.UpdateStatus) {
      additionalEnvs.EXPENSE_RECEIPTS_BUCKET_NAME = props.receiptBucket.bucketName;
    }
    if (lambdaHandlerName === ExpenseCrudLambdaHandler.DeleteItem) {
      additionalEnvs.EXPENSE_RECEIPTS_BUCKET_NAME = props.receiptBucket.bucketName;
      additionalEnvs.RECEIPT_S3_TAGS_TO_ADD = JSON.stringify(props.expenseReceiptContext.deleteTags);
      additionalEnvs.DELETE_EXPENSE_EXPIRES_IN_SEC = parsedDuration(props.expenseReceiptContext.expiration.finalizeReceipt).toSeconds().toString();
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
        EXPENSE_USERID_STATUS_GSI_NAME: props.expenseTable.globalSecondaryIndexes.userIdStatusIndex.name,
        CONFIG_TYPE_TABLE_NAME: props.configTypeTable.table.name,
        CONFIG_TYPE_BELONGS_TO_GSI_NAME: props.configTypeTable.globalSecondaryIndexes.userIdBelongsToIndex.name,
        RECEIPT_KEY_PREFIX: props.expenseReceiptContext.finalizeReceiptKeyPrefix,
        RECEIPT_TEMP_KEY_PREFIX: props.expenseReceiptContext.temporaryKeyPrefix,
        DEFAULT_LOG_LEVEL: this.props.environment === InfraEnvironmentId.Development ? "debug" : "undefined",
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
    return undefined;
  }
}
