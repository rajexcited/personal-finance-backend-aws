import { MethodType } from "../apigateway";
import { AuthRole } from "../common";
import { v4 as uuidv4 } from "uuid";

interface RoleAuthorizeConfigType {
  apiPath: string;
  method: MethodType;
  role: AuthRole[];
}

const UserUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/user/details",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/user/details",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/user/refresh",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/user/logout",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/user/signup",
    method: MethodType.POST,
    role: [],
  },
  {
    apiPath: "/user/login",
    method: MethodType.POST,
    role: [],
  },
];

const ConfigTypeUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/config/types/belongs-to/expense-category",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category/id/*/status/disable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type/id/*/status/disable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/currency-profile",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/currency-profile",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/currency-profile/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/currency-profile/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN],
  },
];

const PymtAccUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/payment/accounts",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/payment/accounts/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/payment/accounts",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/payment/accounts/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/payment/accounts/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/payment/accounts/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN],
  },
];

const ExpenseUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/expenses",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/count",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/id/*/receipts/id/*",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/id/*/receipts/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

export const RoleAuthConfigList: RoleAuthorizeConfigType[] = [
  ...UserUriAuthConfigList,
  ...ConfigTypeUriAuthConfigList,
  ...PymtAccUriAuthConfigList,
  ...ExpenseUriAuthConfigList,
];
