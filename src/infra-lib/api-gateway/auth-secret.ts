import { Construct } from "constructs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { RemovalPolicy } from "aws-cdk-lib";
import { Algorithm } from "jsonwebtoken";
import { AwsResourceType, buildResourceName, ConstructProps } from "../common";
import { parsedDuration } from "../common/utils";

interface AuthSecretProps extends ConstructProps {
  /** node dependent modules */
  layer: lambda.ILayerVersion;
  /** duration with unit to rotate secret. e.g. 1 month */
  secretRotatingDuration: string;
}

interface JwtDetail {
  algorithm: Algorithm;
  type: string;
}
/**
 * temporarily creating secret until aws cognito is integrated.
 * also while rotating secret,
 * salt - can rotate after 6 months. and store prev salt as back to allow current user's password re-encrypted.
 *        force user to reset password if logged in within last recent 2 salts and force user to reset password for security.
 * jwt - can rotate after 6 months. and force user to logged out once rotated.
 */
export class AuthSecretConstruct extends Construct {
  public readonly secret: secretsmanager.Secret;
  public readonly jwtDetails: JwtDetail;

  constructor(scope: Construct, id: string, props: AuthSecretProps) {
    super(scope, id);

    this.jwtDetails = {
      // algorithm to encrypt and decrypt token
      algorithm: "HS256",
      // token type
      type: "JWT",
    };

    const psalt = {
      current: "",
      previous: "",
    };

    const generateTokenConfig: secretsmanager.SecretStringGenerator = {
      passwordLength: 64,
      generateStringKey: "tokenSecret",
      secretStringTemplate: JSON.stringify({ ...this.jwtDetails, psalt }),
      excludeCharacters: undefined,
      excludeLowercase: false,
      excludeUppercase: false,
      excludeNumbers: false,
      excludePunctuation: false,
      includeSpace: false,
      requireEachIncludedType: true,
    };

    const secret = new secretsmanager.Secret(this, "MySecret", {
      description: "secret used in password encryption and signing jwt token",
      secretName: buildResourceName(["auth"], AwsResourceType.SecretManager, props),
      // https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
      //   encryptionKey: kms.Alias.fromAliasName(this, "PSaltKms", "alias/aws/secretsmanager"),
      removalPolicy: RemovalPolicy.DESTROY,
      generateSecretString: generateTokenConfig,
    });
    this.secret = secret;

    const tokenSecretLambdaFunction = new lambda.Function(this, "SecretRotationLambda", {
      functionName: buildResourceName(["token", "salt", "secret", "rotation"], AwsResourceType.Lambda, props),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: "index.secretRotator",
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [props.layer],
      environment: {
        TOKEN_GENERATE_CONFIG: JSON.stringify(generateTokenConfig),
      },
      logRetention: logs.RetentionDays.FIVE_MONTHS,
    });

    secret.addRotationSchedule("tokenSecretRotation", {
      rotationLambda: tokenSecretLambdaFunction,
      automaticallyAfter: parsedDuration(props.secretRotatingDuration),
    });
  }
}
