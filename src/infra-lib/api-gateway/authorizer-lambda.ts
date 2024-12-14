import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { UserDbProps } from "../db/db-prop-type";
import * as logs from "aws-cdk-lib/aws-logs";
import { Duration } from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { AwsResourceType, ConstructProps, InfraEnvironmentId, buildResourceName } from "../common";

interface TokenAuthorizerProps extends ConstructProps {
  layer: lambda.ILayerVersion;
  userTable: UserDbProps;
  restApiPathPrefix: string;
  tokenSecret: secretsmanager.Secret;
}

export class TokenAuthorizerConstruct extends Construct {
  public readonly authorizer: apigateway.IAuthorizer;
  // public readonly tokenSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: TokenAuthorizerProps) {
    super(scope, id);

    // // algorithm to encrypt and decrypt token
    // const algorithm: Algorithm = "HS256";
    // // token type
    // const type = "JWT";
    // const generateTokenConfig: SecretStringGenerator = {
    //   passwordLength: 64,
    //   generateStringKey: "tokenSecret",
    //   secretStringTemplate: JSON.stringify({ algorithm, type }),
    //   excludeCharacters: undefined,
    //   excludeLowercase: false,
    //   excludeUppercase: false,
    //   excludeNumbers: false,
    //   excludePunctuation: false,
    //   includeSpace: false,
    //   requireEachIncludedType: true,
    // };
    // // https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
    // const tokenSecret = new secretsmanager.Secret(this, "TokenSecret", {
    //   description: "secret used to sign jwt token",
    //   secretName: buildResourceName(["jwt"], AwsResourceType.SecretManager, props),
    //   encryptionKey: kms.Alias.fromAliasName(this, "tokenKms", "alias/aws/secretsmanager"),
    //   removalPolicy: RemovalPolicy.DESTROY,
    //   generateSecretString: generateTokenConfig,
    // });
    // this.tokenSecret = tokenSecret;

    // const tokenSecretLambdaFunction = new lambda.Function(this, "SecretRotationLambda", {
    //   functionName: buildResourceName(["token", "secret", "rotation"], AwsResourceType.Lambda, props),
    //   runtime: lambda.Runtime.NODEJS_LATEST,
    //   handler: "index.secretRotator",
    //   code: lambda.Code.fromAsset("src/lambda-handlers"),
    //   layers: [props.layer],
    //   environment: {
    //     TOKEN_GENERATE_CONFIG: JSON.stringify(generateTokenConfig),
    //   },
    //   logRetention: logs.RetentionDays.FIVE_MONTHS,
    // });

    // tokenSecret.addRotationSchedule("tokenSecretRotation", {
    //   rotationLambda: tokenSecretLambdaFunction,
    // });

    const tokenAuthorizerFunction = new lambda.Function(this, "TokenAuthorizerLambda", {
      functionName: buildResourceName(["token", "auth"], AwsResourceType.Lambda, props),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: "index.authorizer",
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        USER_TABLE_NAME: props.userTable.table.name,
        AUTH_SECRET_ID: props.tokenSecret.secretName,
        ROOT_PATH: props.restApiPathPrefix,
        DEFAULT_LOG_LEVEL: props.environment === InfraEnvironmentId.Development ? "debug" : "undefined",
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    props.tokenSecret.grantRead(tokenAuthorizerFunction);
    props.userTable.table.ref.grantReadData(tokenAuthorizerFunction);

    const authorizer = new apigateway.TokenAuthorizer(this, "UserAccessTokenAuthorizer", {
      authorizerName: buildResourceName(["user", "accesstoken"], AwsResourceType.TokenAuthorizer, props),
      handler: tokenAuthorizerFunction,
      validationRegex: "Bearer .+",
      resultsCacheTtl: Duration.minutes(1),
    });
    this.authorizer = authorizer;
  }
}
