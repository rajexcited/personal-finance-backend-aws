import { Construct } from "constructs";
import { AwsResourceType, CloudFrontContextInfo, ConstructProps, buildResourceName } from "../common";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cf from "aws-cdk-lib/aws-cloudfront";
import * as cfo from "aws-cdk-lib/aws-cloudfront-origins";
import { CfnOutput } from "aws-cdk-lib";

export interface DomainCfProps extends ConstructProps {
  uiBucket: s3.IBucket;
  restApi: apigateway.RestApi;
  apiStageName: string;
  // webAclId: string | undefined;
  cfContext: CloudFrontContextInfo;
}

export class DomainCfConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DomainCfProps) {
    super(scope, id);

    const defaultBucketOrigin = cfo.S3BucketOrigin.withOriginAccessControl(props.uiBucket, {
      originId: "s3-static-ui",
    });

    // https://www.iso.org/obp/ui/#search/code/
    let geoRestriction = undefined;
    if (props.cfContext.geoRestriction?.allowCountryCodes?.length) {
      geoRestriction = cf.GeoRestriction.allowlist(...props.cfContext.geoRestriction.allowCountryCodes);
    }

    const relativeUiPath = props.cfContext.pathPrefix.ui.slice(1);
    const relativeApiPath = props.cfContext.pathPrefix.restApi.slice(1);

    const redirectHomepageCfFunction = {
      eventType: cf.FunctionEventType.VIEWER_REQUEST,
      function: new cf.Function(this, "RedirectHomepage", {
        code: cf.FunctionCode.fromInline(getRedirectHomeHandlerFunctionString(props)),
        runtime: cf.FunctionRuntime.JS_2_0,
        functionName: buildResourceName(["redirect", "homepage"], AwsResourceType.CloudFrontFunction, props),
      }),
    };

    const distribution = new cf.Distribution(this, "DistributionConstruct", {
      // defaultRootObject: props.cfContext.homePageUrl,
      // defaultRootObject: relativeUiPath + "/index.html",
      defaultBehavior: {
        origin: defaultBucketOrigin,
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [redirectHomepageCfFunction],
      },
      priceClass: cf.PriceClass.PRICE_CLASS_100,
      // webAclId: props.cfContext.enableWebAcl ? props.webAclId : undefined,
      geoRestriction: geoRestriction,
      errorResponses: this.getErrorResponses(props),
    });

    const apiOrigin = new cfo.RestApiOrigin(props.restApi, {
      originId: "rest-api",
      originPath: "/" + props.apiStageName,
    });
    distribution.addBehavior(relativeApiPath + "/*", apiOrigin, {
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.HTTPS_ONLY,
      cachePolicy: cf.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
    });

    distribution.addBehavior(relativeUiPath + "/*", defaultBucketOrigin, {
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.HTTPS_ONLY,
    });

    const loadHomepageCfFunction = {
      eventType: cf.FunctionEventType.VIEWER_REQUEST,
      function: new cf.Function(this, "LoadHomepage", {
        code: cf.FunctionCode.fromInline(getLoadHomepageHandlerFunctionString(props)),
        runtime: cf.FunctionRuntime.JS_2_0,
        functionName: buildResourceName(["load", "homepage"], AwsResourceType.CloudFrontFunction, props),
      }),
    };
    distribution.addBehavior(props.cfContext.homepageUrl + "*", defaultBucketOrigin, {
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

  private getErrorResponses(props: DomainCfProps) {
    const errorResponse404: cf.ErrorResponse = {
      httpStatus: 404,
      responseHttpStatus: 404,
      responsePagePath: props.cfContext.pathPrefix.errors + "/not-found.html",
    };

    const errorResponse403: cf.ErrorResponse = {
      httpStatus: 403,
      responseHttpStatus: 403,
      responsePagePath: props.cfContext.pathPrefix.errors + "/access-denied.html",
    };

    return [errorResponse403, errorResponse404];
  }
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

function getRedirectHomeHandlerFunctionString(props: DomainCfProps) {
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

  return handler.toString().replace("${props.cfContext.homepageUrl}", props.cfContext.homepageUrl);
}

function getLoadHomepageHandlerFunctionString(props: DomainCfProps) {
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
