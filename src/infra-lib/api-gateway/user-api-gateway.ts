import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Duration } from "aws-cdk-lib";
import { RestApiProps } from "./construct-type";
import { JSONObject } from "../../lambda-handlers";
import { ConfigDbProps, PymtAccDbProps, UserDbProps } from "../db";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { InfraEnvironmentId } from "../common";
import { BaseApiConstruct } from "./base-api";
import { parsedDuration } from "../common/utils";

interface UserApiProps extends RestApiProps {
  userTable: UserDbProps;
  configTypeTable: ConfigDbProps;
  paymentAccountTable: PymtAccDbProps;
  configBucket: IBucket;
  authSecret: secretsmanager.Secret;
  deleteExpiration: string;
}

enum UserLambdaHandler {
  Login = "index.userLogin",
  Signup = "index.userSignup",
  Logout = "index.userLogout",
  Refresh = "index.userTokenRefresh",
  GetDetails = "index.userDetailsGet",
  UpdateDetails = "index.userDetailsUpdate",
  DeleteDetails = "index.userDetailsDelete"
}

enum ModelId {
  UserLoginModel = "UserLoginModel",
  UserSignupModel = "UserSignupModel"
}

export class UserApiConstruct extends BaseApiConstruct {
  // private readonly pSaltSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: UserApiProps) {
    super(scope, id, props);

    // https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
    // this.pSaltSecret = new secretsmanager.Secret(this, "PSaltSecret", {
    //   description: "secret used in encryption",
    //   secretName: buildResourceName(["encrypt"], AwsResourceType.SecretManager, props),
    //   encryptionKey: kms.Alias.fromAliasName(this, "PSaltKms", "alias/aws/secretsmanager"),
    //   removalPolicy: RemovalPolicy.DESTROY,
    // });

    const userResource = props.apiResource.addResource("user");
    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const userLoginResource = userResource.addResource("login");
    // password decryption needs more memory to prevent performance delay
    const loginlambdaFunction = this.buildApi(userLoginResource, HttpMethod.POST, UserLambdaHandler.Login, 512);
    props.userTable.table.ref.grantReadWriteData(loginlambdaFunction);

    const userSignupResource = userResource.addResource("signup");
    const signuplambdaFunction = this.buildApi(userSignupResource, HttpMethod.POST, UserLambdaHandler.Signup, 256);
    props.userTable.table.ref.grantReadWriteData(signuplambdaFunction);
    props.configTypeTable.table.ref.grantReadWriteData(signuplambdaFunction);
    props.paymentAccountTable.table.ref.grantWriteData(signuplambdaFunction);
    props.configBucket.grantRead(signuplambdaFunction);

    const userLogoutResource = userResource.addResource("logout");
    const logoutlambdaFunction = this.buildApi(userLogoutResource, HttpMethod.POST, UserLambdaHandler.Logout, 256);
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

  /**
   * creates apigateway resource with synchronous lambda integration
   *
   * @param resource api resource endpoint
   * @param method Http method
   * @param lambdaHandlerName
   * @param timeoutSec optional. default value is 30 sec
   * @param memoryMb optional.
   * @returns lambda instance
   */
  private buildApi(resource: apigateway.Resource, method: HttpMethod, lambdaHandlerName: UserLambdaHandler, memoryMb?: number, timeoutSec?: number) {
    const useAuthSecret = [
      UserLambdaHandler.Login,
      UserLambdaHandler.Signup,
      UserLambdaHandler.Refresh,
      UserLambdaHandler.UpdateDetails,
      UserLambdaHandler.DeleteDetails
    ].includes(lambdaHandlerName);

    const props = this.props as UserApiProps;
    const additionalEnvs: JSONObject = {};
    if (useAuthSecret) {
      additionalEnvs.AUTH_SECRET_ID = props.authSecret.secretName;
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
      runtime: props.nodeJSRuntime,
      handler: lambdaHandlerName,
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        USER_TABLE_NAME: props.userTable.table.name,
        USER_EMAIL_GSI_NAME: props.userTable.globalSecondaryIndexes.emailIdIndex.name,
        DEFAULT_LOG_LEVEL: this.props.environment === InfraEnvironmentId.Development ? "debug" : "undefined",
        ...additionalEnvs
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: Duration.seconds(timeoutSec || 30),
      memorySize: memoryMb
    });

    if (useAuthSecret) {
      props.authSecret.grantRead(userLambdaFunction);
    }

    const userLambdaIntegration = new apigateway.LambdaIntegration(userLambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER
    });

    const applyAuthorize = ![UserLambdaHandler.Login, UserLambdaHandler.Signup].includes(lambdaHandlerName);
    const baseMethodOption = this.getRequestMethodOptions(lambdaHandlerName, resource);
    const userMethod = resource.addMethod(String(method), userLambdaIntegration, {
      authorizationType: this.getAuthorizationType(applyAuthorize),
      authorizer: applyAuthorize ? props.authorizer : undefined,
      ...baseMethodOption
    });

    return userLambdaFunction;
  }

  getJsonRequestModel(lambdaHandlerName: string): apigateway.Model | undefined {
    return undefined;
  }

  private getAuthorizationType = (authorize?: boolean) => {
    return !!authorize ? apigateway.AuthorizationType.CUSTOM : apigateway.AuthorizationType.NONE;
  };
}
