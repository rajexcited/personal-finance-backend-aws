import { Construct } from "constructs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export class BaseApiConstruct extends Construct {
  getRequestParameters = (resource: apigateway.IResource, queryParams?: Record<string, boolean>) => {
    const pathParams = this.getPathParams(resource);
    const pathParamEntries = pathParams.map((pp) => [`method.request.path.${pp}`, true]);
    const queryParamEntries = Object.entries(queryParams || {}).map((qp) => [`method.request.querystring.${qp[0]}`, qp[1]]);
    const requestParams: Record<string, boolean> = Object.fromEntries([...pathParamEntries, ...queryParamEntries]);
    return requestParams;
  };

  getPathParams(resource: apigateway.IResource) {
    let pathParams: string[] = [];
    if (resource.node.id.startsWith("{") && resource.node.id.endsWith("}")) {
      pathParams.push(resource.node.id.slice(1, -1));
    }
    if (resource.parentResource) {
      pathParams.push(...this.getPathParams(resource.parentResource));
    }
    return pathParams;
  }
}
