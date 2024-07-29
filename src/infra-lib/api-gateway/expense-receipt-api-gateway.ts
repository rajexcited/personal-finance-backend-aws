import { Construct } from "constructs";
import { RestApiProps } from "./construct-type";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { BaseApiConstruct } from "./base-api";
import { IBucket } from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { AwsResourceType, buildResourceName, ExpenseReceiptContextInfo } from "../common";

interface ExpenseReceiptsApiProps extends RestApiProps {
  receiptBucket: IBucket;
  expenseIdResource: apigateway.Resource;
  expenseReceiptContext: ExpenseReceiptContextInfo;
}

export class ExpenseReceiptsApiConstruct extends BaseApiConstruct {
  constructor(scope: Construct, id: string, props: ExpenseReceiptsApiProps) {
    super(scope, id, props);

    const receiptIdResource = props.expenseIdResource.addResource("receipts").addResource("id").addResource("{receiptId}");
    this.uploadReceiptApi(receiptIdResource);
    this.downloadReceiptApi(receiptIdResource);
  }

  private downloadReceiptApi(resource: apigateway.Resource) {
    const executeRole = new iam.Role(this, "downloadReceiptApiGatewayRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      roleName: buildResourceName(["receipt", "download", "apigateway"], AwsResourceType.ExecutionIamRole, this.props),
      description: "s3 integration execution role to download file",
    });
    const props = this.props as ExpenseReceiptsApiProps;

    props.receiptBucket.grantRead(executeRole, props.expenseReceiptContext.finalizeReceiptKeyPrefix + "*");
    const bucket = props.receiptBucket.bucketName;
    const key = props.expenseReceiptContext.finalizeReceiptKeyPrefix + "{userId}/{expenseId}/{receiptId}";

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

    const baseMethodOption = this.getRequestMethodOptions(null, resource);

    const resourceMethod = resource.addMethod(HttpMethod.GET, s3integration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: props.authorizer,
      methodResponses: [{ statusCode: "200" }, { statusCode: "404" }],
      ...baseMethodOption,
    });
  }

  private uploadReceiptApi(resource: apigateway.Resource) {
    const executeRole = new iam.Role(this, "uploadReceiptApiGatewayRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      roleName: buildResourceName(["receipt", "upload", "apigateway"], AwsResourceType.ExecutionIamRole, this.props),
      description: "s3 integration execution role to upload file",
    });
    const props = this.props as ExpenseReceiptsApiProps;

    props.receiptBucket.grantPut(executeRole, props.expenseReceiptContext.temporaryKeyPrefix + "*");
    const bucket = props.receiptBucket.bucketName;
    const key = props.expenseReceiptContext.temporaryKeyPrefix + "{userId}/{expenseId}/{receiptId}";

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

    const baseMethodOption = this.getRequestMethodOptions(null, resource);
    const resourceMethod = resource.addMethod(HttpMethod.POST, s3integration, {
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      authorizer: props.authorizer,
      methodResponses: [{ statusCode: "200" }, { statusCode: "403" }],
      ...baseMethodOption,
    });
  }

  /**
   * json request is not supported
   * @param lambdaHandlerName
   * @returns
   */
  getJsonRequestModel(lambdaHandlerName: string): apigateway.Model | undefined {
    return undefined;
  }
}
