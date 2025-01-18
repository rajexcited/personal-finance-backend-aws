import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { AwsResourceType, ConstructProps, buildResourceName, camelCase } from "../common";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";

export const getTagsRequestQueryParams = { year: false };

export abstract class BaseApiConstruct extends Construct {
  protected readonly props: ConstructProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);
    this.props = props;
  }

  getRequestMethodOptions(lambdaHandlerName: string | null, resource: apigateway.IResource, queryParams?: Record<string, boolean>) {
    const requestParameters = this.getRequestParameters(resource, queryParams);
    const requestModel = lambdaHandlerName ? this.getJsonRequestModel(lambdaHandlerName) : undefined;
    const methodOptions: apigateway.MethodOptions = {
      requestModels: requestModel ? { "application/json": requestModel } : undefined,
      requestParameters: requestParameters,
      requestValidatorOptions: this.getRequestValidatorOptions(requestParameters, requestModel),
    };
    const nonNullIndex = Object.values(methodOptions).findIndex((val) => !!val);
    return nonNullIndex === -1 ? undefined : methodOptions;
  }

  private getRequestParameters = (resource: apigateway.IResource, queryParams?: Record<string, boolean>) => {
    const pathParams = this.getPathParams(resource);
    const pathParamEntries = pathParams.map((pp) => [`method.request.path.${pp}`, true]);
    // commenting query params to remove them from api gateway validations. because i am reaching the api validation limit.
    // will handle the query Params validation in code
    // const queryParamEntries = Object.entries(queryParams || {}).map((qp) => [`method.request.querystring.${qp[0]}`, qp[1]]);
    // const requestParams: Record<string, boolean> = Object.fromEntries([...pathParamEntries, ...queryParamEntries]);
    const requestParams: Record<string, boolean> = Object.fromEntries([...pathParamEntries]);
    return Object.keys(requestParams).length > 0 ? requestParams : undefined;
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

  private getRequestValidatorOptions(requestParameters?: Record<string, boolean>, requestModel?: apigateway.Model) {
    let requestValidatorOptions: apigateway.RequestValidatorOptions | undefined;
    const shouldValidateRequestParameter = Object.values(requestParameters || {}).findIndex((val) => val) !== -1;
    if (!!requestModel || shouldValidateRequestParameter) {
      requestValidatorOptions = {
        validateRequestBody: !!requestModel,
        validateRequestParameters: shouldValidateRequestParameter,
      };
    }

    return requestValidatorOptions;
  }

  /**
   *
   * @param lambdaHandlerName handlerName starts with index.
   */
  public getLambdaNameParts(lambdaHandlerName: string, method: HttpMethod) {
    return [...lambdaHandlerName.split(".").slice(1), String(method).toLowerCase()];
  }

  public getLambdaHandlerId(lambdaHandlerName: string, method: HttpMethod) {
    const lambdaConstructrId = camelCase(this.getLambdaNameParts(lambdaHandlerName, method));
    return lambdaConstructrId + "Lambda";
  }

  public getLambdaFunctionName(lambdaHandlerName: string, method: HttpMethod) {
    return buildResourceName(this.getLambdaNameParts(lambdaHandlerName, method), AwsResourceType.Lambda, this.props);
  }

  abstract getJsonRequestModel(lambdaHandlerName: string): apigateway.Model | undefined;
}
