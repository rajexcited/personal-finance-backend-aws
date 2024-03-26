import { Context, APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { JSONValue, LambdaHandler } from "./wrapper-types";
import { HTTP_STATUS_CODE, MethodType } from "./http-method-type";
import { utils, getLogger } from "./utils";

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

      const message = err instanceof Error ? err.message : String(err);
      logger.error("unknown error", message, err);
      return convertToAPIGatewayEventResult("unknown error", HTTP_STATUS_CODE.UNKNOWN_ERROR);
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
    if (event.headers["Content-Type"] === RequestBodyContentType.JSON && !utils.getJsonObj(event.body as string)) {
      throw new ValidationError([{ path: "request", message: "not valid json" }]);
    }
  }
};

const convertToAPIGatewayEventResult = (result: JSONValue, statusCode?: HTTP_STATUS_CODE): APIGatewayProxyResult => {
  if (!result) {
    return {
      statusCode: Number(HTTP_STATUS_CODE.EMPTY_RESPONSE_CONTENT),
      body: "",
    };
  }

  if (typeof result === "object" && ("statusCode" in result || "body" in result)) {
    let statusCode: number | null = null;

    const code = Number(result.statusCode);
    if (isValidStatusCode(code)) {
      statusCode = code;
    }

    const resp = convertToAPIGatewayEventResult(result.body);
    return {
      statusCode: statusCode ? statusCode : resp.statusCode,
      body: resp.body,
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

export interface InvalidField {
  path: string;
  message: string;
}

export class ValidationError extends Error {
  private invalidFields: InvalidField[];

  constructor(invalidFields: InvalidField[]) {
    super(JSON.stringify(invalidFields, null, 2));
    this.invalidFields = invalidFields;
  }

  public getInvalidFields(): InvalidField[] {
    // deep copy to avoid object reference issue
    return this.invalidFields.map((o) => ({ ...o }));
  }

  public addInvalidField(fieldPathLocation: string, errorMessage: string) {
    this.invalidFields = [...this.invalidFields, { path: fieldPathLocation, message: errorMessage }];
  }
}

export class UnAuthorizedError extends Error {
  constructor(message?: string) {
    super(message);
  }
}
