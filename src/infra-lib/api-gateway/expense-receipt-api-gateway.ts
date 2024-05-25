import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { BaseApiConstruct } from "./base-api";
import { IBucket } from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { RECEIPT_KEY_PREFIX, RECEIPT_TEMP_KEY_PREFIX } from "../../lambda-handlers";

interface ExpenseReceiptsApiProps extends RestApiProps {
  receiptBucket: IBucket;
  expenseIdResource: apigateway.Resource;
}

export class ExpenseReceiptsApiConstruct extends BaseApiConstruct {
  private readonly props: ExpenseReceiptsApiProps;

  constructor(scope: Construct, id: string, props: ExpenseReceiptsApiProps) {
    super(scope, id);

    this.props = props;

    const receiptIdResource = this.props.expenseIdResource.addResource("receipts").addResource("id").addResource("{receiptId}");
    this.uploadReceiptApi(receiptIdResource);
    this.downloadReceiptApi(receiptIdResource);
  }

  private downloadReceiptApi(resource: apigateway.Resource) {
    const executeRole = new iam.Role(this, "downloadReceiptApiGatewayRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      roleName: [this.props.resourcePrefix, this.props.environment, "receipt", "download", "apigateway", "exec", "role"].join("-"),
      description: "s3 integration execution role to download file",
    });
    this.props.receiptBucket.grantRead(executeRole, [RECEIPT_KEY_PREFIX, "*"].join("/"));

    const bucket = this.props.receiptBucket.bucketName;
    const key = RECEIPT_KEY_PREFIX + "/{userId}/{expenseId}/{receiptId}";

    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#context-variable-reference
    const s3integration = new apigateway.AwsIntegration({
      service: "s3",
      path: `${bucket}/${key}`,
      integrationHttpMethod: HttpMethod.GET,
      options: {
        credentialsRole: executeRole,
        passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
        requestParameters: {
          "integration.request.path.receiptId": "method.request.path.receiptId",
          "integration.request.path.expenseId": "method.request.path.expenseId",
          "integration.request.path.userId": "context.authorizer.principalId",
        },
        integrationResponses: [
          {
            statusCode: "200",
            selectionPattern: "200",
          },
          {
            statusCode: "404",
            selectionPattern: "4\\d\\d",
            contentHandling: apigateway.ContentHandling.CONVERT_TO_TEXT,
            responseTemplates: { "text/html": "receipt not found" },
          },
          { statusCode: "500" },
        ],
      },
    });

    const resourceMethod = resource.addMethod(HttpMethod.GET, s3integration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: this.props.authorizer,
      requestValidatorOptions: { validateRequestBody: true, validateRequestParameters: true },
      requestParameters: this.getRequestParameters(resource),
      methodResponses: [{ statusCode: "200" }, { statusCode: "404" }],
    });
  }

  private uploadReceiptApi(resource: apigateway.Resource) {
    const executeRole = new iam.Role(this, "uploadReceiptApiGatewayRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      roleName: [this.props.resourcePrefix, this.props.environment, "receipt", "upload", "apigateway", "exec", "role"].join("-"),
      description: "s3 integration execution role to upload file",
    });
    this.props.receiptBucket.grantPut(executeRole, [RECEIPT_TEMP_KEY_PREFIX, "*"].join("/"));

    const bucket = this.props.receiptBucket.bucketName;
    const key = RECEIPT_TEMP_KEY_PREFIX + "/{userId}/{expenseId}/{receiptId}";

    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#context-variable-reference
    const s3integration = new apigateway.AwsIntegration({
      service: "s3",
      path: `${bucket}/${key}`,
      integrationHttpMethod: HttpMethod.PUT,
      options: {
        credentialsRole: executeRole,
        passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_TEMPLATES,
        requestParameters: {
          "integration.request.path.receiptId": "method.request.path.receiptId",
          "integration.request.path.expenseId": "method.request.path.expenseId",
          "integration.request.path.userId": "context.authorizer.principalId",
        },
        integrationResponses: [
          {
            statusCode: "200",
            selectionPattern: "200",
          },
          {
            statusCode: "403",
            selectionPattern: "4\\d\\d",
          },
          { statusCode: "500" },
        ],
      },
    });

    const resourceMethod = resource.addMethod(HttpMethod.POST, s3integration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: this.props.authorizer,
      requestValidatorOptions: { validateRequestBody: true, validateRequestParameters: true },
      requestParameters: this.getRequestParameters(resource),
      methodResponses: [{ statusCode: "200" }, { statusCode: "403" }],
    });
  }
}
