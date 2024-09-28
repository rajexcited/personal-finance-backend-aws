import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as kms from "aws-cdk-lib/aws-kms";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { JSONObject } from "../../lambda-handlers";
import { ConfigDbProps, PymtAccDbProps, UserDbProps } from "../db";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { AwsResourceType, EnvironmentName, buildResourceName } from "../common";
import { BaseApiConstruct } from "./base-api";
import { parsedDuration } from "../common/utils";

interface UserApiProps extends RestApiProps {
  userTable: UserDbProps;
  configTypeTable: ConfigDbProps;
  paymentAccountTable: PymtAccDbProps;
  configBucket: IBucket;
  tokenSecret: secretsmanager.Secret;
  deleteExpiration: string;
}

enum UserLambdaHandler {
  Login = "index.userLogin",
  Signup = "index.userSignup",
  Logout = "index.userLogout",
  Refresh = "index.userTokenRefresh",
  GetDetails = "index.userDetailsGet",
  UpdateDetails = "index.userDetailsUpdate",
  DeleteDetails = "index.userDetailsDelete",
}

enum ModelId {
  UserLoginModel = "UserLoginModel",
  UserSignupModel = "UserSignupModel",
}

export class UserApiConstruct extends BaseApiConstruct {
  private readonly pSaltSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: UserApiProps) {
    super(scope, id, props);

    // https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
    this.pSaltSecret = new secretsmanager.Secret(this, "PSaltSecret", {
      description: "secret used in encryption",
      secretName: buildResourceName(["encrypt"], AwsResourceType.SecretManager, props),
      encryptionKey: kms.Alias.fromAliasName(this, "PSaltKms", "alias/aws/secretsmanager"),
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const userResource = props.apiResource.addResource("user");
    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const userLoginResource = userResource.addResource("login");
    const loginlambdaFunction = this.buildApi(userLoginResource, HttpMethod.POST, UserLambdaHandler.Login);
    props.userTable.table.ref.grantReadWriteData(loginlambdaFunction);

    const userSignupResource = userResource.addResource("signup");
    const signuplambdaFunction = this.buildApi(userSignupResource, HttpMethod.POST, UserLambdaHandler.Signup);
    props.userTable.table.ref.grantReadWriteData(signuplambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(signuplambdaFunction);
    props.paymentAccountTable.table.ref.grantWriteData(signuplambdaFunction);

    const userLogoutResource = userResource.addResource("logout");
    const logoutlambdaFunction = this.buildApi(userLogoutResource, HttpMethod.POST, UserLambdaHandler.Logout);
    props.userTable.table.ref.grantReadWriteData(logoutlambdaFunction);

    const userRenewResource = userResource.addResource("refresh");
    const renewlambdaFunction = this.buildApi(userRenewResource, HttpMethod.POST, UserLambdaHandler.Refresh);
    props.userTable.table.ref.grantReadWriteData(renewlambdaFunction);

    const userDetailsResource = userResource.addResource("details");
    const getDetailsLambdaFunction = this.buildApi(userDetailsResource, HttpMethod.GET, UserLambdaHandler.GetDetails);
    props.userTable.table.ref.grantReadData(getDetailsLambdaFunction);

    const updateDetailsLambdaFunction = this.buildApi(userDetailsResource, HttpMethod.POST, UserLambdaHandler.UpdateDetails);
    props.userTable.table.ref.grantReadWriteData(updateDetailsLambdaFunction);

    const deleteDetailsLambdaFunction = this.buildApi(userDetailsResource, HttpMethod.DELETE, UserLambdaHandler.DeleteDetails);
    props.userTable.table.ref.grantReadWriteData(deleteDetailsLambdaFunction);
  }

  private buildApi(resource: apigateway.Resource, method: HttpMethod, lambdaHandlerName: UserLambdaHandler) {
    const useTokenSecret = [UserLambdaHandler.Login, UserLambdaHandler.Signup, UserLambdaHandler.Refresh].includes(lambdaHandlerName);
    const usePsaltSecret = [
      UserLambdaHandler.Login,
      UserLambdaHandler.Signup,
      UserLambdaHandler.UpdateDetails,
      UserLambdaHandler.DeleteDetails,
    ].includes(lambdaHandlerName);

    const props = this.props as UserApiProps;
    const additionalEnvs: JSONObject = {};
    if (useTokenSecret) {
      additionalEnvs.TOKEN_SECRET_ID = props.tokenSecret.secretName;
    }

    if (usePsaltSecret) {
      additionalEnvs.PSALT_SECRET_ID = this.pSaltSecret.secretName;
    }

    if (lambdaHandlerName === UserLambdaHandler.Signup) {
      additionalEnvs.CONFIG_DATA_BUCKET_NAME = props.configBucket.bucketName;
      additionalEnvs.CONFIG_TYPE_TABLE_NAME = props.configTypeTable.table.name;
      additionalEnvs.CONFIG_TYPE_BELONGS_TO_GSI_NAME = props.configTypeTable.globalSecondaryIndexes.userIdBelongsToIndex.name;
      additionalEnvs.PAYMENT_ACCOUNT_TABLE_NAME = props.paymentAccountTable.table.name;
    }

    if (lambdaHandlerName === UserLambdaHandler.DeleteDetails) {
      additionalEnvs.DELETE_USER_EXPIRES_IN_SEC = parsedDuration(props.deleteExpiration).toSeconds().toString();
    }

    const userLambdaFunction = new lambda.Function(this, this.getLambdaHandlerId(lambdaHandlerName, method), {
      functionName: this.getLambdaFunctionName(lambdaHandlerName, method),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: lambdaHandlerName,
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        USER_TABLE_NAME: props.userTable.table.name,
        USER_EMAIL_GSI_NAME: props.userTable.globalSecondaryIndexes.emailIdIndex.name,
        DEFAULT_LOG_LEVEL: this.props.environment === EnvironmentName.LOCAL ? "debug" : "undefined",
        ...additionalEnvs,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.seconds(30),
    });

    if (useTokenSecret) {
      props.tokenSecret.grantRead(userLambdaFunction);
    }

    if (usePsaltSecret) {
      this.pSaltSecret.grantRead(userLambdaFunction);
    }

    if (lambdaHandlerName === UserLambdaHandler.Signup) {
      props.configBucket.grantRead(userLambdaFunction);
    }

    const userLambdaIntegration = new apigateway.LambdaIntegration(userLambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
    });

    const baseMethodOption = this.getRequestMethodOptions(lambdaHandlerName, resource);

    const applyAuthorize = ![UserLambdaHandler.Login, UserLambdaHandler.Signup].includes(lambdaHandlerName);

    const userMethod = resource.addMethod(String(method), userLambdaIntegration, {
      authorizationType: this.getAuthorizationType(applyAuthorize),
      authorizer: applyAuthorize ? props.authorizer : undefined,
      ...baseMethodOption,
    });

    return userLambdaFunction;
  }

  getJsonRequestModel(lambdaHandlerName: string): apigateway.Model | undefined {
    if (lambdaHandlerName === UserLambdaHandler.Login) {
      return this.getLoginModel();
    }
    if (lambdaHandlerName === UserLambdaHandler.Signup) {
      return this.getSignupModel();
    }
    return undefined;
  }

  private getAuthorizationType = (authorize?: boolean) => {
    return !!authorize ? apigateway.AuthorizationType.CUSTOM : apigateway.AuthorizationType.NONE;
  };

  /**
   * https://json-schema.org/draft-07/schema#
   *
   * @returns
   */
  private getLoginModel = () => {
    const props = this.props as RestApiProps;
    const userModel: apigateway.Model = props.restApi.addModel(ModelId.UserLoginModel, {
      modelName: ModelId.UserLoginModel,
      contentType: "application/json",
      description: "model for user login",
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

  /**
   * https://json-schema.org/draft-07/schema#
   *
   * @returns
   */
  private getSignupModel = () => {
    const props = this.props as RestApiProps;
    const userModel: apigateway.Model = props.restApi.addModel(ModelId.UserSignupModel, {
      modelName: ModelId.UserSignupModel,
      contentType: "application/json",
      description: "model for user signup",
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT7,
        title: "Signup Schema",
        type: apigateway.JsonSchemaType.OBJECT,
        required: ["firstName", "lastName", "emailId", "password", "countryCode"],
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
          countryCode: {
            type: apigateway.JsonSchemaType.STRING,
            maxLength: 5,
            pattern: "[A-Z]+",
          },
        },
      },
    });
    return userModel;
  };
}
