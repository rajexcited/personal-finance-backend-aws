import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { ConfigDbProps, UserDbProps } from "../db";
import { Duration } from "aws-cdk-lib";
import { ConfigStatus } from "../../lambda-handlers";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { EnvironmentName } from "../common";
import { BaseApiConstruct } from "./base-api";

interface ConfigTypeApiProps extends RestApiProps {
  userTable: UserDbProps;
  configTypeTable: ConfigDbProps;
  configBucket: IBucket;
}

enum ConfigTypeLambdaHandler {
  GetList = "index.configTypeDetailsList",
  AddUpdate = "index.configTypeDetailsAddUpdate",
  GetTagList = "index.configTypeTagList",
  GetItem = "index.configTypeDetailsGet",
  DeleteItem = "index.configTypeDelete",
  UpdateStatus = "index.configTypeStatusUpdate",
}

export class ConfigTypeApiConstruct extends BaseApiConstruct {
  constructor(scope: Construct, id: string, props: ConfigTypeApiProps) {
    super(scope, id, props);

    const configTypeResource = props.apiResource.addResource("config").addResource("types");
    const belongsToResource = configTypeResource.addResource("belongs-to").addResource("{belongsTo}");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const getDetailsLambdaFunction = this.buildApi(belongsToResource, HttpMethod.GET, ConfigTypeLambdaHandler.GetList, { status: false });
    props.userTable.table.ref.grantReadData(getDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(getDetailsLambdaFunction);
    // currency resource needs access to bucket
    props.configBucket.grantRead(getDetailsLambdaFunction);

    const addUpdateDetailsLambdaFunction = this.buildApi(belongsToResource, HttpMethod.POST, ConfigTypeLambdaHandler.AddUpdate);
    props.userTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(addUpdateDetailsLambdaFunction);

    const belongsToTagResource = belongsToResource.addResource("tags");
    const getTagsLambdaFunction = this.buildApi(belongsToTagResource, HttpMethod.GET, ConfigTypeLambdaHandler.GetTagList);
    props.configTypeTable.table.ref.grantReadData(getTagsLambdaFunction);

    const configIdResource = belongsToResource.addResource("id").addResource("{configId}");

    const getConfigTypeLambdaFunction = this.buildApi(configIdResource, HttpMethod.GET, ConfigTypeLambdaHandler.GetItem);
    props.userTable.table.ref.grantReadData(getConfigTypeLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(getConfigTypeLambdaFunction);

    const deleteConfigTypeLambdaFunction = this.buildApi(configIdResource, HttpMethod.DELETE, ConfigTypeLambdaHandler.DeleteItem);
    props.userTable.table.ref.grantReadData(deleteConfigTypeLambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(deleteConfigTypeLambdaFunction);

    const statusResource = configIdResource.addResource("status").addResource("{status}");
    const updateStatusLambdaFunction = this.buildApi(statusResource, HttpMethod.POST, ConfigTypeLambdaHandler.UpdateStatus);
    props.userTable.table.ref.grantReadData(updateStatusLambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(updateStatusLambdaFunction);
  }

  private buildApi(
    resource: apigateway.Resource,
    method: HttpMethod,
    lambdaHandlerName: ConfigTypeLambdaHandler,
    queryParams?: Record<string, boolean>
  ) {
    const props = this.props as ConfigTypeApiProps;
    const lambdaFunction = new lambda.Function(this, this.getLambdaHandlerId(lambdaHandlerName, method), {
      functionName: this.getLambdaFunctionName(lambdaHandlerName, method),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: lambdaHandlerName,
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        USER_TABLE_NAME: props.userTable.table.name,
        CONFIG_TYPE_TABLE_NAME: props.configTypeTable.table.name,
        CONFIG_TYPE_BELONGS_TO_GSI_NAME: props.configTypeTable.globalSecondaryIndexes.userIdBelongsToIndex.name,
        CONFIG_DATA_BUCKET_NAME: props.configBucket.bucketName,
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
    if (lambdaHandlerName === ConfigTypeLambdaHandler.AddUpdate) {
      // return this.getAddUpdateDetailModel();
    }
    return undefined;
  }

  private getAddUpdateDetailModel = () => {
    const props = this.props as RestApiProps;
    const model: apigateway.Model = props.restApi.addModel("ConfigTypeAddUpdateDetailModel", {
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
