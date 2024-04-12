import { Construct } from "constructs";
import { ConstructProps } from "../common";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { DbProps } from "../db/db-prop-type";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Algorithm } from "jsonwebtoken";
import { SecretStringGenerator } from "aws-cdk-lib/aws-secretsmanager";

interface TokenAuthorizerProps extends ConstructProps {
  layer: lambda.ILayerVersion;
  userTable: DbProps;
}

export class TokenAuthorizerConstruct extends Construct {
  public readonly authorizer: apigateway.IAuthorizer;
  public readonly tokenSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: TokenAuthorizerProps) {
    super(scope, id);

    // algorithm to encrypt and decrypt token
    const algorithm: Algorithm = "HS256";
    // token type
    const type = "JWT";
    const generateTokenConfig: SecretStringGenerator = {
      passwordLength: 64,
      generateStringKey: "tokenSecret",
      secretStringTemplate: JSON.stringify({ algorithm, type }),
      excludeCharacters: undefined,
      excludeLowercase: false,
      excludeUppercase: false,
      excludeNumbers: false,
      excludePunctuation: false,
      includeSpace: false,
      requireEachIncludedType: true,
    };
    // https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
    const tokenSecret = new secretsmanager.Secret(this, "TokenSecret", {
      description: "secret used to sign jwt token",
      secretName: [props.resourcePrefix, props.environment, "jwt", "secret"].join("-"),
      encryptionKey: kms.Alias.fromAliasName(this, "tokenKms", "alias/aws/secretsmanager"),
      removalPolicy: RemovalPolicy.DESTROY,
      generateSecretString: generateTokenConfig,
    });
    this.tokenSecret = tokenSecret;

    const tokenSecretLambdaFunction = new lambda.Function(this, "SecretRotationLambda", {
      functionName: [props.resourcePrefix, props.environment, "token", "secret", "rotation", "func"].join("-"),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: "index.secretRotator",
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        TOKEN_GENERATE_CONFIG: JSON.stringify(generateTokenConfig),
      },
      logRetention: logs.RetentionDays.FIVE_MONTHS,
    });

    tokenSecret.addRotationSchedule("tokenSecretRotation", {
      rotationLambda: tokenSecretLambdaFunction,
    });

    const tokenAuthorizerFunction = new lambda.Function(this, "TokenAuthorizerLambda", {
      functionName: [props.resourcePrefix, props.environment, "token", "auth", "lambda", "func"].join("-"),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: "index.authorizer",
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        USER_TABLE_NAME: props.userTable.table.name,
        TOKEN_SECRET_ID: tokenSecret.secretName,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    tokenSecret.grantRead(tokenAuthorizerFunction);
    props.userTable.table.ref.grantReadData(tokenAuthorizerFunction);

    const authorizer = new apigateway.TokenAuthorizer(this, "UserAccessTokenAuthorizer", {
      authorizerName: [props.resourcePrefix, props.environment, "user", "accesstoken", "authorizer"].join("-"),
      handler: tokenAuthorizerFunction,
      // identitySource: "Authorization",
      validationRegex: "Bearer .+",
      resultsCacheTtl: Duration.minutes(1),
    });
    this.authorizer = authorizer;
  }
}
