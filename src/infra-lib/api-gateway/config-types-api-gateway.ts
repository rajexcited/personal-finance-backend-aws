import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { DbProps } from "../db";
import { Duration } from "aws-cdk-lib";
import { ConfigStatus } from "../../lambda-handlers";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { AwsResourceType, EnvironmentName, buildResourceName } from "../common";
import { BaseApiConstruct } from "./base-api";

interface ConfigTypeApiProps extends RestApiProps {
  userTable: DbProps;
  configTypeTable: DbProps;
  configBucket: IBucket;
}

export class ConfigTypeApiConstruct extends BaseApiConstruct {
  private readonly props: ConfigTypeApiProps;

  constructor(scope: Construct, id: string, props: ConfigTypeApiProps) {
    super(scope, id);

    this.props = props;

    const configTypeResource = this.props.apiResource.addResource("config").addResource("types");
    const belongsToResource = configTypeResource.addResource("belongs-to").addResource("{belongsTo}");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const getDetailsLambdaFunction = this.buildApi(belongsToResource, HttpMethod.GET, "index.configTypeDetailsGet", { status: false });
    props.userTable.table.ref.grantReadData(getDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(getDetailsLambdaFunction);
    props.configBucket.grantRead(getDetailsLambdaFunction);

    const addUpdateDetailsLambdaFunction = this.buildApi(belongsToResource, HttpMethod.POST, "index.configTypeDetailsAddUpdate");
    props.userTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(addUpdateDetailsLambdaFunction);
    props.configBucket.grantRead(addUpdateDetailsLambdaFunction);

    const configIdResource = belongsToResource.addResource("id").addResource("{configId}");
    const deleteConfigTypeLambdaFunction = this.buildApi(configIdResource, HttpMethod.DELETE, "index.configTypeDelete");
    props.userTable.table.ref.grantReadData(deleteConfigTypeLambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(deleteConfigTypeLambdaFunction);
    props.configBucket.grantRead(deleteConfigTypeLambdaFunction);

    const statusResource = configIdResource.addResource("status").addResource("{status}");
    const updateStatusLambdaFunction = this.buildApi(statusResource, HttpMethod.POST, "index.configTypeStatusUpdate");
    props.userTable.table.ref.grantReadData(updateStatusLambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(updateStatusLambdaFunction);
    props.configBucket.grantRead(updateStatusLambdaFunction);
  }

  private buildApi(resource: apigateway.Resource, method: HttpMethod, lambdaHandlerName: string, queryParams?: Record<string, boolean>) {
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
        CONFIG_DATA_BUCKET_NAME: this.props.configBucket.bucketName,
        DEFAULT_LOG_LEVEL: this.props.environment === EnvironmentName.LOCAL ? "debug" : "undefined",
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.seconds(30),
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
    });

    if (lambdaHandlerName.includes("configTypeDetailsAddUpdate")) {
      const resourceMethod = resource.addMethod(String(method), lambdaIntegration, {
        authorizationType: apigateway.AuthorizationType.CUSTOM,
        authorizer: this.props.authorizer,
        requestModels: { "application/json": this.getAddUpdateDetailModel() },
        requestValidatorOptions: { validateRequestBody: true, validateRequestParameters: true },
        requestParameters: this.getRequestParameters(resource, queryParams),
      });
    } else {
      const resourceMethod = resource.addMethod(String(method), lambdaIntegration, {
        authorizationType: apigateway.AuthorizationType.CUSTOM,
        authorizer: this.props.authorizer,
        requestValidatorOptions: { validateRequestParameters: true },
        requestParameters: this.getRequestParameters(resource, queryParams),
      });
    }

    return lambdaFunction;
  }

  private getAddUpdateDetailModel = () => {
    const model: apigateway.Model = this.props.restApi.addModel("ConfigTypeAddUpdateDetailModel", {
      modelName: "ConfigTypeAddUpdateDetailModel",
      contentType: "application/json",
      description: "add update config type details model",
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT7,
        title: "ConfigType Detail Schema",
        type: apigateway.JsonSchemaType.OBJECT,
        required: ["name", "value", "status", "tags"],
        properties: {
          name: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 15,
            pattern: "[\\w\\s\\.,<>\\?'\";:\\{\\}\\[\\]|`~!@#\\$%\\^&\\*\\(\\)\\+=-]+",
          },
          value: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 15,
            pattern: "[\\w\\s\\.,<>\\?'\";:\\{\\}\\[\\]|`~!@#\\$%\\^&\\*\\(\\)\\+=-]+",
          },
          description: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 400,
            pattern: "[\\w\\s\\.,<>\\?\\/'\";:\\{\\}\\[\\]|\\\\`~!@#\\$%\\^&\\*\\(\\)\\+=-\\Sc]+",
          },
          belongsTo: {
            type: apigateway.JsonSchemaType.STRING,
            enum: ["expense-category", "pymt-account-type", "currency-profile"],
          },
          status: {
            type: apigateway.JsonSchemaType.STRING,
            enum: [ConfigStatus.ENABLE, ConfigStatus.DISABLE, ConfigStatus.DELETED],
          },
          color: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 7,
            pattern: "#[a-zA-Z0-9]+",
          },
          id: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 36,
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
