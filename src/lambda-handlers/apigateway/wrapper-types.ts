import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export type JSONValue = string | number | boolean | Date | JSONObject | JSONArray | null | undefined;

export interface JSONObject {
  [key: string]: JSONValue;
}

export interface JSONArray extends Array<JSONValue> {}

export type LambdaHandler = (event: APIGatewayProxyEvent) => Promise<JSONValue | APIGatewayProxyResult>;
