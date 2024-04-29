import { getLogger, validations } from "../utils";
import { AuthRole } from "../common";
import { APIGatewayProxyEvent } from "aws-lambda";
import { UnAuthorizedError } from "../apigateway";
import { AuthorizeUser } from "./resource-type";

/**
 * DynamoDB code example
 * https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-dynamodb-utilities.html
 */

export const _userTableName = process.env.USER_TABLE_NAME as string;
export const _userEmailGsiName = process.env.USER_EMAIL_GSI_NAME as string;
export const _logger = getLogger("user");

export enum ErrorMessage {
  UNKNOWN_USER = "unknown user",
  INCORRECT_VALUE = "incorrect value",
  INCORRECT_FORMAT = "incorrect format",
  MISSING_VALUE = "missing value",
  EMAIL_ALREADY_EXISTS = "the user with emailId already exists",
}

export enum UserResourcePath {
  USER = "user",
  REQUEST = "request",
  NEWPASSWORD = "newPassword",
  PASSWORD = "password",
  FIRSTNAME = "firstName",
  LASTNAME = "lastName",
  EMAILID = "emailId",
  COUNTRY = "country",
}

export const getDetailsTablePk = (userId: string) => {
  return `userId#${userId}#details`;
};

export const getTokenTablePk = (userId: string) => {
  return `userId#${userId}#token`;
};

export const getEmailGsiPk = (emailId: string) => {
  return `emailId#${emailId}`;
};

export const getAuthorizeUser = (event: APIGatewayProxyEvent) => {
  const userId = event.requestContext.authorizer?.principalId;
  if (!userId || !validations.isValidUuid(userId)) {
    throw new UnAuthorizedError("missing userId in authorizer");
  }

  const role = event.requestContext.authorizer?.role;
  if (role !== AuthRole.ADMIN && role !== AuthRole.PRIMARY) {
    throw new UnAuthorizedError("incorrect role in authorizer");
  }

  const authUser: AuthorizeUser = {
    userId,
    role,
  };
  return authUser;
};

export const getValidatedUserId = (event: APIGatewayProxyEvent) => {
  const authUser = getAuthorizeUser(event);
  return authUser.userId;
};
