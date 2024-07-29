import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { ConfigDbProps, PymtAccDbProps, UserDbProps } from "../db";
import { Duration } from "aws-cdk-lib";
import { ConfigStatus } from "../../lambda-handlers";
import { EnvironmentName } from "../common";
import { BaseApiConstruct } from "./base-api";

interface PymtAccApiProps extends RestApiProps {
  userTable: UserDbProps;
  configTypeTable: ConfigDbProps;
  pymtAccTable: PymtAccDbProps;
}

enum PaymentAccountLambdaHandler {
  GetList = "index.pymtAccList",
  AddUpdate = "index.pymtAccDetailsAddUpdate",
  GetTagList = "index.pymtAccTagList",
  GetItem = "index.pymtAccGet",
  DeleteItem = "index.pymtAccDelete",
  UpdateStatus = "index.pymtAccStatusUpdate",
}

export class PymtAccApiConstruct extends BaseApiConstruct {
  constructor(scope: Construct, id: string, props: PymtAccApiProps) {
    super(scope, id, props);

    const pymtAccResource = props.apiResource.addResource("payment").addResource("accounts");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const pymtAccListRequestQueryParams = {
      status: false,
    };
    const getListLambdaFunction = this.buildApi(pymtAccResource, HttpMethod.GET, PaymentAccountLambdaHandler.GetList, pymtAccListRequestQueryParams);
    props.userTable.table.ref.grantReadData(getListLambdaFunction);
    props.pymtAccTable.table.ref.grantReadData(getListLambdaFunction);

    const addUpdateDetailsLambdaFunction = this.buildApi(pymtAccResource, HttpMethod.POST, PaymentAccountLambdaHandler.AddUpdate);
    props.userTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.pymtAccTable.table.ref.grantReadWriteData(addUpdateDetailsLambdaFunction);

    const pymtAccTagResource = pymtAccResource.addResource("tags");
    const getTagsLambdaFunction = this.buildApi(pymtAccTagResource, HttpMethod.GET, PaymentAccountLambdaHandler.GetTagList);
    props.pymtAccTable.table.ref.grantReadData(getTagsLambdaFunction);

    const pymtAccIdResource = pymtAccResource.addResource("id").addResource("{pymtAccId}");
    const getPymtAccLambdaFunction = this.buildApi(pymtAccIdResource, HttpMethod.GET, PaymentAccountLambdaHandler.GetItem);
    props.userTable.table.ref.grantReadData(getPymtAccLambdaFunction);
    props.pymtAccTable.table.ref.grantReadData(getPymtAccLambdaFunction);

    const deletePymtAccLambdaFunction = this.buildApi(pymtAccIdResource, HttpMethod.DELETE, PaymentAccountLambdaHandler.DeleteItem);
    props.userTable.table.ref.grantReadData(deletePymtAccLambdaFunction);
    props.pymtAccTable.table.ref.grantReadWriteData(deletePymtAccLambdaFunction);

    const statusResource = pymtAccIdResource.addResource("status").addResource("{status}");
    const updateStatusLambdaFunction = this.buildApi(statusResource, HttpMethod.POST, PaymentAccountLambdaHandler.UpdateStatus);
    props.userTable.table.ref.grantReadData(updateStatusLambdaFunction);
    props.pymtAccTable.table.ref.grantReadWriteData(updateStatusLambdaFunction);
  }

  private buildApi(
    resource: apigateway.Resource,
    method: HttpMethod,
    lambdaHandler: PaymentAccountLambdaHandler,
    queryParams?: Record<string, boolean>
  ) {
    const props = this.props as PymtAccApiProps;

    const lambdaFunction = new lambda.Function(this, this.getLambdaHandlerId(lambdaHandler, method), {
      functionName: this.getLambdaFunctionName(lambdaHandler, method),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: lambdaHandler,
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        USER_TABLE_NAME: props.userTable.table.name,
        CONFIG_TYPE_TABLE_NAME: props.configTypeTable.table.name,
        CONFIG_TYPE_BELONGS_TO_GSI_NAME: props.configTypeTable.globalSecondaryIndexes.userIdBelongsToIndex.name,
        PAYMENT_ACCOUNT_TABLE_NAME: props.pymtAccTable.table.name,
        PAYMENT_ACCOUNT_USERID_GSI_NAME: props.pymtAccTable.globalSecondaryIndexes.userIdStatusShortnameIndex.name,
        DEFAULT_LOG_LEVEL: this.props.environment === EnvironmentName.LOCAL ? "debug" : "undefined",
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.seconds(30),
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
    });

    const baseMethodOption = this.getRequestMethodOptions(lambdaHandler, resource, queryParams);

    const resourceMethod = resource.addMethod(String(method), lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: props.authorizer,
      ...baseMethodOption,
    });

    return lambdaFunction;
  }

  getJsonRequestModel(lambdaHandlerName: string) {
    if (lambdaHandlerName === PaymentAccountLambdaHandler.AddUpdate) {
      return this.getAddUpdateDetailModel();
    }
    return undefined;
  }

  private getAddUpdateDetailModel() {
    const props = this.props as RestApiProps;
    const model: apigateway.Model = props.restApi.addModel("PymtAccAddUpdateDetailModel", {
      modelName: "PymtAccAddUpdateDetailModel",
      contentType: "application/json",
      description: "add update payment account details model",
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT7,
        title: "Payment account Detail Schema",
        type: apigateway.JsonSchemaType.OBJECT,
        required: ["shortName", "typeId", "status", "tags"],
        properties: {
          id: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 36,
          },
          shortName: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 20,
            pattern: "[\\w\\s\\.@#\\$&\\+-]+",
          },
          accountIdNum: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 25,
            pattern: "[\\w\\.,|\\+-]+",
          },
          institutionName: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 25,
            pattern: "[\\w\\s\\.,\\?|#\\+-]+",
          },
          typeId: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 36,
          },
          description: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 400,
            pattern: "[\\w\\s\\.,<>\\?\\/'\";:\\{\\}\\[\\]|\\\\`~!@#\\$%\\^&\\*\\(\\)\\+=-\\Sc]+",
          },
          status: {
            type: apigateway.JsonSchemaType.STRING,
            enum: [ConfigStatus.ENABLE, ConfigStatus.DISABLE, ConfigStatus.DELETED],
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
  }
}
