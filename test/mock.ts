import { APIGatewayProxyEvent, APIGatewayProxyEventHeaders, Context } from "aws-lambda";
import { MethodType } from "../src/lambda-handlers/apigateway";
import { JSONValue } from "../src/lambda-handlers";

export const noop = () => {};

export const mockContext: Context = {
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
  succeed: noop,
};

export const getMockApiGatewayProxyEvent = (method: MethodType, body?: JSONValue) => {
  let eventBody: string | null;
  let contentType = undefined;

  if (typeof body === "object") {
    eventBody = JSON.stringify(body);
    contentType = "application/json";
  } else if (body) {
    eventBody = String(body);
    contentType = "text/plain";
  } else {
    eventBody = null;
  }

  const headers: APIGatewayProxyEventHeaders = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  const mockEvent: APIGatewayProxyEvent = {
    body: eventBody,
    headers: headers,
    multiValueHeaders: Object.fromEntries(Object.entries(headers).map((hdr) => [hdr[0], hdr[1]?.split(",")])),
    httpMethod: method,
    isBase64Encoded: false,
    multiValueQueryStringParameters: null,
    path: "/path",
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      accountId: "acc-id",
      apiId: "api-id",
      authorizer: {},
      httpMethod: method,
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
        userArn: null,
      },
      path: "/path",
      protocol: "https",
      requestId: "req-id",
      requestTimeEpoch: 0,
      resourceId: "rsc-id",
      resourcePath: "rsc-path",
      stage: "stage",
    },
    resource: "rsc",
    stageVariables: null,
  };

  return mockEvent;
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
    error,
  } as ConsoleMock;
};
