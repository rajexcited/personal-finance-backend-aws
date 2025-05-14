import { APIGatewayProxyEvent, APIGatewayProxyEventHeaders, Context } from "aws-lambda";
import { MethodType } from "../../src/lambda-handlers/apigateway";
import { JSONValue } from "../../src/lambda-handlers";

export const noop = () => {};

export const getMockContext = () => {
  const cxt: Context = {
    awsRequestId: "aws-req-id",
    functionName: "signup-function",
    functionVersion: "func-v1",
    callbackWaitsForEmptyEventLoop: false,
    invokedFunctionArn: "func-arn",
    logGroupName: "log-group-name",
    logStreamName: "log-stream-name",
    memoryLimitInMB: "256mb",
    getRemainingTimeInMillis: () => 1,
    done: noop,
    fail: noop,
    succeed: noop
  };
  return cxt;
};

interface MockApiGatewayProxyEventParam {
  method: MethodType;
  body?: JSONValue;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  pathParameters?: Record<string, string>;
}

export const getMockApiGatewayProxyEvent = (mockParamEvent: MockApiGatewayProxyEventParam) => {
  let eventBody: string | null;

  if (typeof mockParamEvent.body === "object") {
    eventBody = JSON.stringify(mockParamEvent.body);
  } else if (mockParamEvent.body) {
    eventBody = String(mockParamEvent.body);
  } else {
    eventBody = null;
  }

  const headers = getMockHeaders(mockParamEvent);

  const mockEvent: APIGatewayProxyEvent = {
    body: eventBody,
    headers: headers,
    multiValueHeaders: getMultiValues(headers) || {},
    httpMethod: mockParamEvent.method,
    isBase64Encoded: false,
    path: "/path",
    pathParameters: mockParamEvent.pathParameters || null,
    queryStringParameters: mockParamEvent.queryStringParameters || null,
    multiValueQueryStringParameters: getMultiValues(mockParamEvent.queryStringParameters),
    requestContext: {
      accountId: "acc-id",
      apiId: "api-id",
      authorizer: {
        principalId: "b89241ee-7ff2-48ea-bd30-d322fdcde6d1",
        role: "primary"
      },
      httpMethod: mockParamEvent.method,
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: "0.0.0.0",
        user: null,
        userAgent: null,
        userArn: null
      },
      path: "/path",
      protocol: "https",
      requestId: "req-id",
      requestTimeEpoch: 0,
      resourceId: "rsc-id",
      resourcePath: "rsc-path",
      stage: "stage"
    },
    resource: "rsc",
    stageVariables: null
  };

  return mockEvent;
};

const getMultiValues = (obj?: Record<string, string | undefined>) => {
  if (!obj) {
    return null;
  }
  return Object.fromEntries(Object.entries(obj).map((entry) => [entry[0], entry[1]?.split(",")]));
};

const getMockHeaders = (mockEvent: MockApiGatewayProxyEventParam) => {
  const headers: APIGatewayProxyEventHeaders = {};
  if (mockEvent.headers) {
    const headersObj = mockEvent.headers;
    Object.keys(headersObj).forEach((headerKey) => {
      const headerValue = headersObj[headerKey];
      headers[headerKey] = headerValue;
    });
  }

  let contentType = undefined;
  if (typeof mockEvent.body === "object") {
    contentType = "application/json";
  } else if (mockEvent.body) {
    contentType = "text/plain";
  }
  headers["Content-Type"] = contentType;

  return headers;
};

export interface ConsoleMock {
  debug: jest.SpyInstance;
  log: jest.SpyInstance;
  info: jest.SpyInstance;
  warn: jest.SpyInstance;
  error: jest.SpyInstance;
}

export const spyConsole = () => {
  const debug = jest.spyOn(console, "debug").mockImplementation(noop);
  const log = jest.spyOn(console, "log").mockImplementation(noop);
  const info = jest.spyOn(console, "info").mockImplementation(() => {});
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const error = jest.spyOn(console, "error").mockImplementation(() => {});

  return {
    debug,
    log,
    info,
    warn,
    error
  } as ConsoleMock;
};
