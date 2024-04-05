import { Construct } from "constructs";
import { RequestParameters, RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { DbProps } from "../db";
import { Duration } from "aws-cdk-lib";

interface ConfigTypeApiProps extends RestApiProps {
  userTable: DbProps;
  configTypeTable: DbProps;
}

export class ConfigTypeApiConstruct extends Construct {
  private readonly props: ConfigTypeApiProps;

  constructor(scope: Construct, id: string, props: ConfigTypeApiProps) {
    super(scope, id);

    this.props = props;

    const configTypeResource = this.props.restApi.root.addResource("config").addResource("types");
    const belongsToResource = configTypeResource.addResource("belongs-to").addResource("{belongsTo}");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const getDetailsLambdaFunction = this.buildApi(belongsToResource, HttpMethod.GET, "index.configTypeDetailsGet", { status: false });
    props.userTable.table.ref.grantReadData(getDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadData(getDetailsLambdaFunction);

    const addUpdateDetailsLambdaFunction = this.buildApi(belongsToResource, HttpMethod.POST, "index.configTypeDetailsAddUpdate");
    props.userTable.table.ref.grantReadData(addUpdateDetailsLambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(addUpdateDetailsLambdaFunction);

    const configIdResource = configTypeResource.addResource("id").addResource("{id}");
    const deleteConfigTypeLambdaFunction = this.buildApi(configIdResource, HttpMethod.DELETE, "index.configTypeDelete");
    props.userTable.table.ref.grantReadData(deleteConfigTypeLambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(deleteConfigTypeLambdaFunction);

    const statusResource = configIdResource.addResource("status").addResource("{status}");
    const updateStatusLambdaFunction = this.buildApi(statusResource, HttpMethod.POST, "index.configTypeStatusUpdate");
    props.userTable.table.ref.grantReadData(updateStatusLambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(updateStatusLambdaFunction);
  }

  private buildApi(resource: apigateway.Resource, method: HttpMethod, lambdaHandlerName: string, queryParams?: RequestParameters) {
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
        CONFIG_TYPE_TABLE_NAME: this.props.userTable.table.name,
        CONFIG_TYPE_BELONGS_TO_GSI_NAME: this.props.userTable.globalSecondaryIndexes.emailIdIndex.name,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.seconds(30),
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
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
    const model: apigateway.Model = this.props.restApi.addModel("AddUpdateDetailModel", {
      contentType: "application/json",
      description: "add update config type details model",
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT7,
        title: "ConfigType Detail Schema",
        type: apigateway.JsonSchemaType.OBJECT,
        required: ["name", "value"],
        properties: {
          name: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 3,
            maxLength: 15,
            pattern: "^[\\w\\s\\.,-]+$",
          },
          value: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 3,
            maxLength: 15,
            pattern: "^[\\w\\s\\.,-]+$",
          },
          description: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 100,
          },
          status: {
            type: apigateway.JsonSchemaType.STRING,
            enum: ["enable", "disable", "deleted"],
          },
          color: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 7,
            pattern: "#[\\w]+",
          },
          id: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 36,
          },
        },
      },
    });
    return model;
  };

  private getRequestParameters = (resource: apigateway.IResource, queryParams?: RequestParameters) => {
    const pathParams = this.getPathParams(resource);
    const pathParamEntries = pathParams.map((pp) => [`method.request.path.${pp}`, true]);
    const queryParamEntries = Object.entries(queryParams || {}).map((qp) => [`method.request.querystring.${qp[0]}`, qp[1]]);
    const requestParams: RequestParameters = Object.fromEntries([...pathParamEntries, ...queryParamEntries]);
    return requestParams;
  };

  private getPathParams(resource: apigateway.IResource) {
    let pathParams: string[] = [];
    if (resource.node.id.startsWith("{") && resource.node.id.endsWith("}")) {
      pathParams.push(resource.node.id.slice(1, -1));
    }
    if (resource.parentResource) {
      pathParams.push(...this.getPathParams(resource.parentResource));
    }
    return pathParams;
  }
}
