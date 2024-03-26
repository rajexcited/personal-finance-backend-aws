import { Construct } from "constructs";
import { ConstructProps } from "../common";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { DbProps } from "../db/db-prop-type";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as kms from "aws-cdk-lib/aws-kms";
import { RemovalPolicy } from "aws-cdk-lib";
import { JSONObject } from "../../lambda-handlers/wrapper-types";
import * as bcrypt from "bcryptjs";

interface UserApiProps extends ConstructProps {
  userTable: DbProps;
  layer: lambda.ILayerVersion;
  authorizer: apigateway.IAuthorizer;
  tokenSecret: secretsmanager.Secret;
}

enum ModelId {
  UserLoginModel = "UserLoginModel",
  UserSignupModel = "UserSignupModel",
}

export class UserApiConstruct extends Construct {
  private readonly props: UserApiProps;
  private modelMap = new Map<ModelId, apigateway.Model>();
  private readonly restApi: apigateway.RestApi;
  private readonly pSaltSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: UserApiProps) {
    super(scope, id);

    this.props = props;
    // https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
    this.pSaltSecret = new secretsmanager.Secret(this, "PSaltSecret", {
      description: "secret used in encryption",
      secretName: [props.resourcePrefix, props.environment, "encrypt", "secret"].join("-"),
      encryptionKey: kms.Alias.fromAliasName(this, "PSaltKms", "alias/aws/secretsmanager"),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const restApi = new apigateway.RestApi(this, "UserRestApi", {
      restApiName: [props.resourcePrefix, props.environment, "user"].join("-"),
      deployOptions: {
        stageName: props.environment,
        description: "rest apis",
      },
    });
    this.restApi = restApi;

    const userResource = restApi.root.addResource("user");
    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const userLoginResource = userResource.addResource("login");
    const loginlambdaFunction = this.buildApi(
      userLoginResource,
      HttpMethod.POST,
      "index.userLogin",
      false,
      ModelId.UserLoginModel
    );
    props.userTable.table.ref.grantReadWriteData(loginlambdaFunction);

    const userSignupResource = userResource.addResource("signup");
    const signuplambdaFunction = this.buildApi(
      userSignupResource,
      HttpMethod.POST,
      "index.userSignup",
      false,
      ModelId.UserSignupModel
    );
    props.userTable.table.ref.grantReadWriteData(signuplambdaFunction);

    const userLogoutResource = userResource.addResource("logout");
    const logoutlambdaFunction = this.buildApi(userLogoutResource, HttpMethod.POST, "index.userLogout", true);
    props.userTable.table.ref.grantReadWriteData(logoutlambdaFunction);

    const userRenewResource = userResource.addResource("refresh");
    const renewlambdaFunction = this.buildApi(userRenewResource, HttpMethod.POST, "index.renewToken", true);
    props.userTable.table.ref.grantReadWriteData(renewlambdaFunction);

    const userDetailsResource = userResource.addResource("details");
    const getDetailsLambdaFunction = this.buildApi(userDetailsResource, HttpMethod.GET, "index.getUserDetails", true);
    props.userTable.table.ref.grantReadData(getDetailsLambdaFunction);

    const updateDetailsLambdaFunction = this.buildApi(
      userDetailsResource,
      HttpMethod.POST,
      "index.updateUserDetails",
      true
    );
    props.userTable.table.ref.grantReadWriteData(updateDetailsLambdaFunction);
  }

  private buildApi(
    resource: apigateway.Resource,
    method: HttpMethod,
    lambdaHandlerName: string,
    applyAuthorize: boolean,
    modelId?: ModelId
  ) {
    const useTokenSecret =
      lambdaHandlerName.includes("userLogin") ||
      lambdaHandlerName.includes("userSignup") ||
      lambdaHandlerName.includes("renewToken");

    const usePsaltSecret =
      lambdaHandlerName.includes("userLogin") ||
      lambdaHandlerName.includes("userSignup") ||
      lambdaHandlerName.includes("updateUserDetails");

    const additionalEnvs: JSONObject = {};
    if (useTokenSecret) {
      additionalEnvs.TOKEN_SECRET_ID = this.props.tokenSecret.secretName;
    }

    if (usePsaltSecret) {
      additionalEnvs.PSALT_SECRET_ID = this.pSaltSecret.secretName;
    }
    const uniqueConstructName = method + lambdaHandlerName.replace("index.", "");
    const userLambdaFunction = new lambda.Function(this, `User${uniqueConstructName}Lambda`, {
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
        USER_EMAIL_GSI_NAME: this.props.userTable.globalSecondaryIndexes.emailIdIndex.name,
        ...additionalEnvs,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    if (useTokenSecret) {
      this.props.tokenSecret.grantRead(userLambdaFunction);
    }
    if (usePsaltSecret) {
      this.pSaltSecret.grantRead(userLambdaFunction);
    }

    const userLambdaIntegration = new apigateway.LambdaIntegration(userLambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
    });

    const userMethod = resource.addMethod(String(method), userLambdaIntegration, {
      authorizationType: this.getAuthorizationType(applyAuthorize),
      authorizer: applyAuthorize ? this.props.authorizer : undefined,
      requestModels: this.getRequestModel(modelId),
      requestValidatorOptions: this.getRequestValidateOptions(modelId),
    });

    return userLambdaFunction;
  }

  private getRequestModel = (modelId: ModelId | undefined) => {
    let res: { [param: string]: apigateway.IModel } | undefined = undefined;
    if (modelId) {
      res = { "application/json": this.getModel(modelId) };
    }
    return res;
  };

  private getRequestValidateOptions = (modelId: ModelId | undefined) => {
    let res: apigateway.RequestValidatorOptions | undefined = undefined;
    if (modelId) {
      res = { validateRequestBody: true };
    }
    return res;
  };

  private getAuthorizationType = (authorize?: boolean) => {
    return !!authorize ? apigateway.AuthorizationType.CUSTOM : apigateway.AuthorizationType.NONE;
  };

  private getModel = (id: ModelId) => {
    let model: apigateway.Model | undefined;
    if (this.modelMap.has(id)) {
      model = this.modelMap.get(id);
    } else if (id === ModelId.UserLoginModel) {
      model = this.getLoginModel();
    } else if (id === ModelId.UserSignupModel) {
      model = this.getSignupModel();
    }
    if (!model) throw new Error("unknown model id [" + id + "]");
    this.modelMap.set(id, model);
    return model;
  };

  private getLoginModel = () => {
    const userModel: apigateway.Model = this.restApi.addModel(ModelId.UserLoginModel, {
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT7,
        title: "Login Schema",
        type: apigateway.JsonSchemaType.OBJECT,
        required: ["emailId", "password"],
        properties: {
          emailId: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 8,
            maxLength: 50,
            pattern: "^\\w+([\\.-]?\\w+)*@\\w+([\\.-]?\\w+)*(\\.\\w{2,3})+$",
          },
          password: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 8,
            maxLength: 25,
            pattern: "^(?=.*[\\d])(?=.*[A-Z])(?=.*[!@#$%^&*])[\\w!@#$%^&\\(\\)\\=*]{8,25}$",
          },
        },
      },
    });
    return userModel;
  };
  private getSignupModel = () => {
    const userModel: apigateway.Model = this.restApi.addModel(ModelId.UserSignupModel, {
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT7,
        title: "Signup Schema",
        type: apigateway.JsonSchemaType.OBJECT,
        required: ["firstName", "lastName", "emailId", "password"],
        properties: {
          firstName: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 2,
            maxLength: 25,
            pattern: "^[\\w\\s]+$",
          },
          lastName: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 2,
            maxLength: 25,
            pattern: "^[\\w\\s]+$",
          },
          emailId: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 8,
            maxLength: 50,
            pattern: "^\\w+([\\.-]?\\w+)*@\\w+([\\.-]?\\w+)*(\\.\\w{2,3})+$",
          },
          password: {
            type: apigateway.JsonSchemaType.STRING,
            minLength: 8,
            maxLength: 25,
            pattern: "^(?=.*[\\d])(?=.*[A-Z])(?=.*[!@#$%^&*])[\\w!@#$%^&\\(\\)\\=*]{8,25}$",
          },
        },
      },
    });
    return userModel;
  };
}
