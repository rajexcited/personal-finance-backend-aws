import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as cfo from "aws-cdk-lib/aws-cloudfront-origins";
import { CfnOutput } from "aws-cdk-lib";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { AwsInfraEnvironment } from "./aws-infra-env.enum";
import { buildResourceName } from "./utils";
import { AwsResourceType } from "./props-type";

interface HelloCdkStackProps extends cdk.StackProps {
  infraEnv: AwsInfraEnvironment;
  appId: string;
}

interface CfHeaderValue {
  value: string;
}

interface CfRequest {
  method: string;
  uri: string;
  querystring: Record<string, string>;
  headers: Record<string, CfHeaderValue>;
  cookies: Record<string, string>;
}

interface CfEvent {
  request: CfRequest;
}

interface CfResponse {
  statusCode: number;
  statusDescription: string;
  headers: Record<string, CfHeaderValue>;
  body?: unknown;
}

export class HelloCdkStack extends cdk.Stack {
  private lambda_layers: cdk.aws_lambda.ILayerVersion[] = [];
  private mydb: cdk.aws_dynamodb.Table;
  private databucket: cdk.aws_s3.Bucket;
  private authorizer: cdk.aws_apigateway.TokenAuthorizer;
  private props: HelloCdkStackProps;

  constructor(scope: Construct, id: string, props: HelloCdkStackProps) {
    super(scope, id, props);
    this.props = props;
    // The code that defines your stack goes here

    // example resource
    const queue = new sqs.Queue(this, "HelloCdkQueue", {
      queueName: buildResourceName(["hellocdk", "my", "first"], AwsResourceType.Sqs, props),
      visibilityTimeout: cdk.Duration.seconds(300),
    });

    const db = new dynamodb.Table(this, "DummyDynamoDb", {
      tableName: buildResourceName(["dummy"], AwsResourceType.Dynamodb, props),
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: true,
      timeToLiveAttribute: "Expires",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.mydb = db;

    const gsiProp: dynamodb.GlobalSecondaryIndexProps = {
      indexName: buildResourceName(["dummy"], AwsResourceType.GlobalSecondaryIndex),
      partitionKey: { name: "E_GSI_PK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    };
    db.addGlobalSecondaryIndex(gsiProp);

    const bucket = new s3.Bucket(this, "DummyDataBucketS3", {
      autoDeleteObjects: true,
      bucketName: buildResourceName(["dummy", "data"], AwsResourceType.S3Bucket, props),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.databucket = bucket;

    const bucketDeploymentConstructId = buildResourceName(["dummy"], AwsResourceType.BucketDeployment, props);
    const deployment = new s3Deploy.BucketDeployment(this, bucketDeploymentConstructId, {
      destinationBucket: bucket,
      sources: [s3Deploy.Source.asset("data")],
    });

    const layer = new lambda.LayerVersion(this, "DummyLambdaLayer", {
      layerVersionName: buildResourceName(["dummy", "api"], AwsResourceType.LambdaLayer, props),
      compatibleRuntimes: [lambda.Runtime.NODEJS_LATEST],
      // asset path is relative to project
      code: lambda.AssetCode.fromAsset("lambda_layer/"),
    });
    this.lambda_layers.push(layer);

    const generateConfig: secretsmanager.SecretStringGenerator = {
      passwordLength: 64,
      generateStringKey: "dummy-secret",
      secretStringTemplate: JSON.stringify({ field: "fields1", type: "actor" }),
      excludeCharacters: undefined,
      excludeLowercase: false,
      excludeUppercase: false,
      excludeNumbers: false,
      excludePunctuation: false,
      includeSpace: false,
      requireEachIncludedType: true,
    };
    const secret = new secretsmanager.Secret(this, "DummySecret", {
      description: "dummy secret used",
      secretName: buildResourceName(["dummy", "v2"], AwsResourceType.SecretManager, props),
      encryptionKey: kms.Alias.fromAliasName(this, "DummyKms", "alias/aws/secretsmanager"),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      generateSecretString: generateConfig,
    });

    const secretLambdaFunction = new lambda.Function(this, "DummySecretRotationLambda", {
      functionName: buildResourceName(["dummy", "secret", "rotation"], AwsResourceType.Lambda, props),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: "index.secretRotator",
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [layer],
      environment: {
        TOKEN_GENERATE_CONFIG: JSON.stringify(generateConfig),
      },
      logRetention: logs.RetentionDays.FIVE_MONTHS,
    });

    secret.addRotationSchedule("dummySecretRotation", {
      rotationLambda: secretLambdaFunction,
    });

    const tokenAuthorizerFunction = new lambda.Function(this, "TokenAuthorizerLambda", {
      functionName: buildResourceName(["dummy", "token", "auth"], AwsResourceType.Lambda, props),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: "index.authorizer",
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: [layer],
      environment: {
        TABLE_NAME: db.tableName,
        TOKEN_SECRET_ID: secret.secretName,
        ROOT_PATH: "/rest",
        DEFAULT_LOG_LEVEL: "debug",
      },
      logRetention: logs.RetentionDays.ONE_DAY,
    });
    secret.grantRead(tokenAuthorizerFunction);
    db.grantReadData(tokenAuthorizerFunction);

    const authorizer = new apigateway.TokenAuthorizer(this, "AccessTokenAuthorizer", {
      authorizerName: buildResourceName(["access", "token"], AwsResourceType.TokenAuthorizer, props),
      handler: tokenAuthorizerFunction,
      validationRegex: "Bearer .+",
      resultsCacheTtl: cdk.Duration.minutes(1),
    });
    this.authorizer = authorizer;

    const restApi = new apigateway.RestApi(this, "DummyRestApi", {
      restApiName: buildResourceName(["backend"], AwsResourceType.RestApi, props),
      binaryMediaTypes: ["*/*"],
      deployOptions: {
        stageName: "stage-name",
        description: "stage name rest apis",
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
    });

    const apiResource = restApi.root.addResource("rest").addResource("api").addResource("{apitype}");

    //  request validator setup
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-method-request-validation.html
    const getDetailsLambdaFunction = this.buildApi(apiResource, HttpMethod.GET, "getDetails");
    db.grantReadData(getDetailsLambdaFunction);
    bucket.grantRead(getDetailsLambdaFunction);

    const addUpdateDetailsLambdaFunction = this.buildApi(apiResource, HttpMethod.POST, "addUpdateDetails");
    db.grantReadWriteData(addUpdateDetailsLambdaFunction);
    bucket.grantWrite(addUpdateDetailsLambdaFunction);

    const deleteDetailsLambdaFunction = this.buildApi(apiResource, HttpMethod.DELETE, "deleteDetails");
    db.grantReadWriteData(deleteDetailsLambdaFunction);
    bucket.grantWrite(deleteDetailsLambdaFunction);

    /*************************************************************************************************************************************************
     *************************************************************************************************************************************************
     */

    const uiBucket = new s3.Bucket(this, "UIStaticBucketS3", {
      autoDeleteObjects: true,
      bucketName: buildResourceName(["dummy", "ui", "static"], AwsResourceType.S3Bucket, props),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const errorBucketDeploymentConstructId = buildResourceName(["dummy", "cf", "error"], AwsResourceType.BucketDeployment, props);
    const cfErrorDeployment = new s3Deploy.BucketDeployment(this, errorBucketDeploymentConstructId, {
      destinationBucket: uiBucket,
      sources: [s3Deploy.Source.asset("error-pages")],
      destinationKeyPrefix: "errors/",
    });

    const cntryBucketDeploymentConstructId = buildResourceName(["dummy", "cf", "cntry"], AwsResourceType.BucketDeployment, props);
    const cntryDataDeployment = new s3Deploy.BucketDeployment(this, cntryBucketDeploymentConstructId, {
      destinationBucket: uiBucket,
      sources: [s3Deploy.Source.asset("config-data", { exclude: ["**/default-*.json"] })],
      destinationKeyPrefix: "ui/config/",
    });

    const defaultBucketOrigin = cfo.S3BucketOrigin.withOriginAccessControl(uiBucket, {
      originId: "s3-static-ui",
    });

    const redirectHomepageCfFunction = {
      eventType: cf.FunctionEventType.VIEWER_REQUEST,
      function: new cf.Function(this, "RedirectHomepage", {
        code: cf.FunctionCode.fromInline(getRedirectHomeHandlerFunctionString()),
        runtime: cf.FunctionRuntime.JS_2_0,
        functionName: buildResourceName(["redirect", "homepage"], AwsResourceType.CloudFrontFunction, props),
      }),
    };

    const distribution = new cf.Distribution(this, "DistributionConstruct", {
      defaultBehavior: {
        origin: defaultBucketOrigin,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [redirectHomepageCfFunction],
      },
      priceClass: cf.PriceClass.PRICE_CLASS_100,
      errorResponses: this.getErrorResponses(),
    });

    const apiOrigin = new cfo.RestApiOrigin(restApi, {
      originId: "rest-api",
      originPath: "/stage",
    });
    distribution.addBehavior("api/*", apiOrigin, {
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.HTTPS_ONLY,
      cachePolicy: cf.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    });

    distribution.addBehavior("ui/*", defaultBucketOrigin, {
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.HTTPS_ONLY,
    });

    const loadHomepageCfFunction = {
      eventType: cf.FunctionEventType.VIEWER_REQUEST,
      function: new cf.Function(this, "LoadHomepage", {
        code: cf.FunctionCode.fromInline(getLoadHomepageHandlerFunctionString()),
        runtime: cf.FunctionRuntime.JS_2_0,
        functionName: buildResourceName(["load", "homepage"], AwsResourceType.CloudFrontFunction, props),
      }),
    };
    distribution.addBehavior("home*", defaultBucketOrigin, {
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      functionAssociations: [loadHomepageCfFunction],
    });

    const cfDistributionDomainOutput = new CfnOutput(this, "CfDistributionDomainOutput", {
      value: distribution.distributionDomainName,
      key: buildResourceName(["distribution", "domain"], AwsResourceType.CftOutput, props),
    });

    const cfDistributionIdOutput = new CfnOutput(this, "CfDistributionIdOutput", {
      value: distribution.distributionId,
      key: buildResourceName(["distribution", "id"], AwsResourceType.CftOutput, props),
    });
  }

  private buildApi(resource: apigateway.Resource, method: HttpMethod, lambdaHandlerName: string) {
    const lambdaFunction = new lambda.Function(this, lambdaHandlerName + method + "FunctionConstruct", {
      functionName: buildResourceName([lambdaHandlerName, method], AwsResourceType.Lambda, this.props),
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: lambdaHandlerName,
      // asset path is relative to project
      code: lambda.Code.fromAsset("src/lambda-handlers"),
      layers: this.lambda_layers,
      environment: {
        TABLE_NAME: this.mydb.tableName,
        DATA_BUCKET_NAME: this.databucket.bucketName,
        DEFAULT_LOG_LEVEL: "debug",
      },
      logRetention: logs.RetentionDays.ONE_DAY,
      timeout: cdk.Duration.seconds(30),
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction, {
      proxy: true,
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
    });

    const reqParams: Record<string, boolean> = { "method.request.path.apitype": true };
    if (method === HttpMethod.GET) {
      reqParams["method.request.querystring.qry1"] = false;
    }

    const resourceMethod = resource.addMethod(String(method), lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: this.authorizer,
      requestParameters: reqParams,
      requestValidatorOptions: {
        validateRequestParameters: true,
      },
    });

    return lambdaFunction;
  }

  private getErrorResponses() {
    const errorResponse404: cf.ErrorResponse = {
      httpStatus: 404,
      responseHttpStatus: 404,
      responsePagePath: "/errors/not-found.html",
    };

    const errorResponse403: cf.ErrorResponse = {
      httpStatus: 403,
      responseHttpStatus: 403,
      responsePagePath: "/errors/access-denied.html",
    };

    return [errorResponse403, errorResponse404];
  }

  // private downloadReceiptApi(resource: apigateway.Resource) {

  //   const executeRole = new iam.Role(this, "downloadReceiptApiGatewayRole", {
  //     assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
  //     roleName: buildResourceName(["receipt", "download", "apigateway"], AwsResourceType.ExecutionIamRole, this.props),
  //     description: "s3 integration execution role to download file",
  //   });

  //   const finalizeReceiptKeyPrefix = props.receiptContext.finalizeReceiptKeyPrefix;
  //   // const finalizeReceiptKeyPrefix = props.receiptContext.finalizeReceiptKeyPrefix + props.prefix + "/";
  //   props.receiptBucket.grantRead(executeRole, finalizeReceiptKeyPrefix + "*");
  //   const bucket = props.receiptBucket.bucketName;
  //   const key = finalizeReceiptKeyPrefix + "{belongsTo}/{userId}/{expenseId}/{receiptId}";

  //   // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#context-variable-reference
  //   const s3integration = new apigateway.AwsIntegration({
  //     service: "s3",
  //     path: `${bucket}/${key}`,
  //     integrationHttpMethod: HttpMethod.GET,
  //     options: {
  //       credentialsRole: executeRole,
  //       passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
  //       requestParameters: {
  //         "integration.request.path.receiptId": "method.request.path.receiptId",
  //         "integration.request.path.expenseId": "method.request.path.expenseId",
  //         "integration.request.path.belongsTo": "method.request.path.belongsTo",
  //         "integration.request.path.userId": "context.authorizer.principalId",
  //       },
  //       integrationResponses: [
  //         {
  //           statusCode: "200",
  //           selectionPattern: "200",
  //         },
  //         {
  //           statusCode: "404",
  //           selectionPattern: "4\\d\\d",
  //           contentHandling: apigateway.ContentHandling.CONVERT_TO_TEXT,
  //           responseTemplates: { "text/html": "receipt not found" },
  //         },
  //         { statusCode: "500" },
  //       ],
  //     },
  //   });

  //   const baseMethodOption = this.getRequestMethodOptions(null, resource);

  //   const resourceMethod = resource.addMethod(HttpMethod.GET, s3integration, {
  //     authorizationType: apigateway.AuthorizationType.CUSTOM,
  //     authorizer: props.authorizer,
  //     methodResponses: [{ statusCode: "200" }, { statusCode: "404" }],
  //     ...baseMethodOption,
  //   });
  // }

  // private uploadReceiptApi(resource: apigateway.Resource) {
  //   const props = this.props as ReceiptsApiProps;

  //   const executeRole = new iam.Role(this, "uploadReceiptApiGatewayRole", {
  //     assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
  //     roleName: buildResourceName(["receipt", "upload", "apigateway"], AwsResourceType.ExecutionIamRole, this.props),
  //     description: "s3 integration execution role to upload file",
  //   });

  //   const tempKeyPrefix = props.receiptContext.temporaryKeyPrefix;
  //   // const tempKeyPrefix = props.receiptContext.temporaryKeyPrefix + props.prefix + "/";
  //   props.receiptBucket.grantPut(executeRole, tempKeyPrefix + "*");
  //   const bucket = props.receiptBucket.bucketName;
  //   const key = tempKeyPrefix + "{belongsTo}/{userId}/{expenseId}/{receiptId}";

  //   // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#context-variable-reference
  //   const s3integration = new apigateway.AwsIntegration({
  //     service: "s3",
  //     path: `${bucket}/${key}`,
  //     integrationHttpMethod: HttpMethod.PUT,
  //     options: {
  //       credentialsRole: executeRole,
  //       passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
  //       requestParameters: {
  //         "integration.request.path.receiptId": "method.request.path.receiptId",
  //         "integration.request.path.expenseId": "method.request.path.expenseId",
  //         "integration.request.path.belongsTo": "method.request.path.belongsTo",
  //         "integration.request.path.userId": "context.authorizer.principalId",
  //       },
  //       integrationResponses: [
  //         {
  //           statusCode: "200",
  //           selectionPattern: "200",
  //         },
  //         {
  //           statusCode: "403",
  //           selectionPattern: "4\\d\\d",
  //         },
  //         { statusCode: "500" },
  //       ],
  //     },
  //   });

  //   const baseMethodOption = this.getRequestMethodOptions(null, resource);
  //   const resourceMethod = resource.addMethod(HttpMethod.POST, s3integration, {
  //     authorizationType: apigateway.AuthorizationType.CUSTOM,
  //     authorizer: props.authorizer,
  //     methodResponses: [{ statusCode: "200" }, { statusCode: "403" }],
  //     ...baseMethodOption,
  //   });
  // }
}

function getRedirectHomeHandlerFunctionString() {
  async function handler(event: CfEvent) {
    const homepageUrl = "${props.cfContext.homepageUrl}";
    const request = event.request;
    if (request.uri === "/") {
      const response: CfResponse = {
        statusCode: 302,
        statusDescription: "Found",
        headers: {
          location: {
            value: `https://${request.headers.host.value}/${homepageUrl}`,
          },
        },
      };
      return response;
    }
    return request;
  }

  return handler.toString().replace("${props.cfContext.homepageUrl}", "home");
}

function getLoadHomepageHandlerFunctionString() {
  function handler(event: CfEvent) {
    const request = event.request;

    // if (true) {
    //   const resp: CfResponse = {
    //     statusCode: 200,
    //     statusDescription: "OK",
    //     headers: {},
    //     body: event,
    //   };
    //   return resp;
    // }
    // Check whether the URI is missing a file name.
    // if (uri.endsWith("/")) {
    //   request.uri += "index.html";
    // }
    // Check whether the URI is missing a file extension.
    // else
    //  if (!uri.includes("index.html")) {
    const rootPath = request.uri.split("/").find((a) => a);
    request.uri = "/" + rootPath + "/index.html";
    // }

    return request;
  }

  // async function handler(event: CfEvent) {
  //   console.log("event", JSON.stringify(event));
  //   const homepageUrl = "${props.cfContext.homepageUrl}";
  //   const request = event.request;
  //   // request.uri = `/${homepageUrl}/index.html`;
  //   if (!request.uri.includes("index.html")) {
  //     request.uri += request.uri.endsWith("/") ? "" : "/" + "index.html";
  //   }
  //   return request;
  // }

  // return handler.toString().replace("${props.cfContext.homepageUrl}", props.cfContext.homepageUrl);
  return handler.toString();
}
