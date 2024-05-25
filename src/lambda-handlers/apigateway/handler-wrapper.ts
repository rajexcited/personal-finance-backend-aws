import { Context, APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { JSONValue, LambdaHandler } from "./wrapper-types";
import { HTTP_STATUS_CODE, MethodType } from "./http-method-type";
import { utils, getLogger } from "../utils";
import { NotFoundError, UnAuthorizedError, ValidationError } from "./errors";
import { StopWatch } from "stopwatch-node";

const _logger = getLogger("handler-wrapper");

export enum RequestBodyContentType {
  JSON = "application/json",
}

export const resourceCreated = (result: JSONValue) => {
  const resp = {
    statusCode: HTTP_STATUS_CODE.CREATED,
    body: result,
  };
  return resp as JSONValue;
};

const isValidStatusCode = (code: number) => {
  return !isNaN(code) && code > 199 && code < 599;
};

export const apiGatewayHandlerWrapper = (callback: LambdaHandler, requiredBodyType?: RequestBodyContentType) => {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const stopwatch = new StopWatch("apiGatewayHandlerWrapper");
    stopwatch.start();
    const logger = getLogger("handler", _logger);
    try {
      logger.debug("event", event);
      logger.debug("context", context);

      validateEvent(event, requiredBodyType);
      const result = await callback(event);
      const resp = convertToAPIGatewayEventResult(result);
      logger.debug("responding success message", resp.body);
      return resp;
    } catch (err) {
      if (err instanceof ValidationError) {
        logger.error("there are validation errors", err.getInvalidFields());
        const invalidFields = err.getInvalidFields().map((o) => ({ ...o } as JSONValue));
        return convertToAPIGatewayEventResult(invalidFields, HTTP_STATUS_CODE.BAD_REQUEST);
      }

      if (err instanceof UnAuthorizedError) {
        logger.error("user is not authorized", err.message);
        return convertToAPIGatewayEventResult("not authorized", HTTP_STATUS_CODE.UNAUTHORIZED);
      }

      if (err instanceof NotFoundError) {
        logger.error("request not exist", err.message);
        return convertToAPIGatewayEventResult("not found", HTTP_STATUS_CODE.NOT_FOUND);
      }

      const message = err instanceof Error ? err.message : String(err);
      logger.error("unknown error", message, err);
      return convertToAPIGatewayEventResult("unknown error", HTTP_STATUS_CODE.UNKNOWN_ERROR);
    } finally {
      stopwatch.stop();
      logger.info("stopwatch summary", stopwatch.shortSummary());
    }
  };
};

const validateEvent = (event: APIGatewayProxyEvent, requiredBodyType?: RequestBodyContentType) => {
  const logger = getLogger("validateEvent", _logger);
  logger.debug("httpMethod: ", event.httpMethod);
  const allowedMethodForJSONRequest = [MethodType.POST.toString(), MethodType.PUT.toString()];
  if (requiredBodyType && allowedMethodForJSONRequest.includes(event.httpMethod)) {
    if (!event.body) {
      throw new ValidationError([{ path: "request", message: "missing request body" }]);
    }
    if (event.headers["Content-Type"] !== requiredBodyType) {
      throw new ValidationError([{ path: "request", message: "incorrect request body" }]);
    }
    if (event.headers["Content-Type"] === RequestBodyContentType.JSON) {
      event.body = atob(event.body);
      if (!utils.getJsonObj(event.body)) {
        throw new ValidationError([{ path: "request", message: "not valid json" }]);
      }
    }
  }
};

export const convertToCreatedResponse = (result: JSONValue) => {
  return convertToAPIGatewayEventResult(result, HTTP_STATUS_CODE.CREATED);
};

const convertToAPIGatewayEventResult = (result: JSONValue | APIGatewayProxyResult, statusCode?: HTTP_STATUS_CODE | null): APIGatewayProxyResult => {
  if (!result) {
    return {
      statusCode: Number(HTTP_STATUS_CODE.EMPTY_RESPONSE_CONTENT),
      body: "",
    };
  }

  if (isInstanceofAPIGatewayProxyResult(result)) {
    let statusCode: number | null = null;
    const res = result as APIGatewayProxyResult;

    const code = Number(res.statusCode);
    if (isValidStatusCode(code)) {
      statusCode = code;
    }

    const resp = convertToAPIGatewayEventResult(res.body);
    return {
      statusCode: statusCode ? statusCode : resp.statusCode,
      body: resp.body,
      headers: res.headers,
    };
  }
  let body: string;
  if (typeof result === "object") {
    body = JSON.stringify(result);
  } else {
    body = String(result);
  }
  return {
    statusCode: Number(statusCode || HTTP_STATUS_CODE.SUCCESS),
    body,
  };
};

const isInstanceofAPIGatewayProxyResult = (obj: unknown) => {
  let key: string | undefined = undefined;
  if (obj && typeof obj === "object") {
    key = ["statusCode", "body", "headers"].find((key) => key in obj);
  }
  return key !== undefined;
};
