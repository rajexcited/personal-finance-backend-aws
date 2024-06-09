import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { DbProps } from "../db";
import { Duration } from "aws-cdk-lib";
import { ConfigStatus } from "../../lambda-handlers";
import { AwsResourceType, EnvironmentName, buildResourceName } from "../common";
import { BaseApiConstruct } from "./base-api";

interface PymtAccApiProps extends RestApiProps {
  userTable: DbProps;
  configTypeTable: DbProps;
  pymtAccTable: DbProps;
}

export class PymtAccApiConstruct extends BaseApiConstruct {
  private readonly props: PymtAccApiProps;

  constructor(scope: Construct, id: string, props: PymtAccApiProps) {
    super(scope, id);

    this.props = props;

    const pymtAccResource = this.props.apiResource.addResource("payment").addResource("accounts");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const getListLambdaFunction = this.buildApi(pymtAccResource, HttpMethod.GET, "index.pymtAccList");
    props.userTable.table.ref.grantReadData(getListLambdaFunction);
    props.pymtAccTable.table.ref.grantReadData(getListLambdaFunction);

    const addUpdateDetailsLambdaFunction = this.buildApi(pymtAccResource, HttpMethod.POST, "index.pymtAccDetailsAddUpdate");
    props.userTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.pymtAccTable.table.ref.grantReadWriteData(addUpdateDetailsLambdaFunction);

    const pymtAccIdResource = pymtAccResource.addResource("id").addResource("{pymtAccId}");
    const deletePymtAccLambdaFunction = this.buildApi(pymtAccIdResource, HttpMethod.DELETE, "index.pymtAccDelete");
    props.userTable.table.ref.grantReadData(deletePymtAccLambdaFunction);
    props.pymtAccTable.table.ref.grantReadWriteData(deletePymtAccLambdaFunction);

    const statusResource = pymtAccIdResource.addResource("status").addResource("{status}");
    const updateStatusLambdaFunction = this.buildApi(statusResource, HttpMethod.POST, "index.pymtAccStatusUpdate");
    props.userTable.table.ref.grantReadData(updateStatusLambdaFunction);
    props.pymtAccTable.table.ref.grantReadWriteData(updateStatusLambdaFunction);
  }

  private buildApi(resource: apigateway.Resource, method: HttpMethod, lambdaHandlerName: string) {
    const lambdaNameParts = [...lambdaHandlerName.split(".").slice(1), String(method).toLowerCase()];

    const lambdaFunction = new lambda.Function(this, `${method}${lambdaHandlerName.replace("index.", "")}Lambda`, {
      functionName: buildResourceName(lambdaNameParts, AwsResourceType.Lambda, this.props),
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
        DEFAULT_LOG_LEVEL: this.props.environment === EnvironmentName.LOCAL ? "debug" : "undefined",
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
      requestModels: lambdaHandlerName.includes("pymtAccDetailsAddUpdate") ? { "application/json": this.getAddUpdateDetailModel() } : undefined,
      requestValidatorOptions: { validateRequestBody: true, validateRequestParameters: true },
      requestParameters: this.getRequestParameters(resource),
    });

    return lambdaFunction;
  }

  private getAddUpdateDetailModel = () => {
    const model: apigateway.Model = this.props.restApi.addModel("PymtAccAddUpdateDetailModel", {
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
  };
}
