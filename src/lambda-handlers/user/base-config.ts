import { getLogger, validations } from "../utils";
import { AuthRole } from "../common";
import { APIGatewayProxyEvent } from "aws-lambda";
import { UnAuthorizedError } from "../apigateway";
import { ApiUserResource, AuthorizeUser, DbUserDetails, DbUserTokenDetails } from "./resource-type";
import { TokenPayload } from "../auth/auth-type";

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
  EMAIL_ALREADY_EXISTS = "the user with emailId already exists"
}

export enum UserResourcePath {
  USER = "user",
  REQUEST = "request",
  NEWPASSWORD = "newPassword",
  PASSWORD = "password",
  FIRSTNAME = "firstName",
  LASTNAME = "lastName",
  EMAILID = "emailId",
  COUNTRY = "country"
}

const getUserId = (details: DbUserDetails | AuthorizeUser) => {
  if ("id" in details) {
    return details.id;
  }
  return details.userId;
};

export const getDetailsTablePk = (user: DbUserDetails | AuthorizeUser) => {
  return `userId#${getUserId(user)}#details`;
};

export const getEmailGsiPk = (dbUser: DbUserDetails | ApiUserResource) => {
  return `emailId#${dbUser.emailId}`;
};

export const getTokenTablePk = (user: DbUserDetails | AuthorizeUser) => {
  return `userId#${getUserId(user)}#token`;
};

export const getTokenGsiPk = (tokenObj: TokenPayload | DbUserTokenDetails) => {
  if ("id" in tokenObj) {
    return `sessionId#${tokenObj.id}`;
  }
  return `sessionId#${tokenObj.sessionId}`;
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
    role
  };
  return authUser;
};

export const getValidatedUserId = (event: APIGatewayProxyEvent) => {
  const authUser = getAuthorizeUser(event);
  return authUser.userId;
};

export const getPlatForm = (event: APIGatewayProxyEvent) => {
  let platform = event.headers["sec-ch-ua-platform"];
  if (platform) {
    return platform;
  }
  return "Unknown";
};

export const getUserAgent = (event: APIGatewayProxyEvent) => {
  const useragent = event.headers["User-Agent"];
  return useragent || "NA";
};

export const getBrowser = (event: APIGatewayProxyEvent) => {
  const useragent = getUserAgent(event);
  if (useragent.includes("Edg")) {
    return "Microsoft Edge";
  }
  if (useragent.includes("Chrome")) {
    return "Chrome";
  }
  if (useragent.includes("Ghostery")) {
    return "Ghostery";
  }
  if (useragent.includes("Firefox")) {
    return "Firefox";
  }
  if (useragent.includes("Mobile") && useragent?.includes("Safari")) {
    return "Safari";
  }
  return "Unknown";
};

export const getBrowserVersion = (event: APIGatewayProxyEvent) => {
  const browser = getBrowser(event);

  let useragentbrowser = browser;
  if (browser === "Microsoft Edge") {
    useragentbrowser = "Edg";
  }
  const version = findVersion(getUserAgent(event), useragentbrowser);
  if (version) {
    return version;
  }
  return "Unknown";
};

const findVersion = (useragent: string, browser: string, withSeperator?: string) => {
  if (!withSeperator) {
    let version: string = findVersion(useragent, browser, "/");
    if (!version) {
      version = findVersion(useragent, browser, ":");
    }
    return version;
  }

  const parts = useragent.split(browser + withSeperator);
  if (parts.length > 1 && parts[1].length > 0) {
    const versionParts = parts[1].split(/[\s\)]/);
    if (versionParts[0].length > 0) {
      return versionParts[0];
    }
  }
  return "";
};

export const getDeviceType = (event: APIGatewayProxyEvent) => {
  if (event.headers["CloudFront-Is-Mobile-Viewer"] === "true") {
    return "Mobile";
  }
  if (event.headers["CloudFront-Is-Desktop-Viewer"] === "true") {
    return "Desktop";
  }
  return "Unknown";
};

export const getCity = (event: APIGatewayProxyEvent) => {
  const city = event.headers["CloudFront-Viewer-City"];
  if (city) {
    return city;
  }
  return "Unknown";
};

export const getState = (event: APIGatewayProxyEvent) => {
  const state = event.headers["CloudFront-Viewer-Country-Region"];
  if (state) {
    return state;
  }
  return "Unknown";
};
export const getCountryCode = (event: APIGatewayProxyEvent) => {
  const cntryCd = event.headers["CloudFront-Viewer-Country"];
  if (cntryCd) {
    return cntryCd;
  }
  return "Unknown";
};
