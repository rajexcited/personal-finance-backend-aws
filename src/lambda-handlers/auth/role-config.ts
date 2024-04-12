import { MethodType } from "../apigateway";
import { Role } from "./auth-type";

interface RoleAuthorizeConfigType {
  apiPath: string;
  method: MethodType;
  role: Role[];
}

const UserUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/user/details",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/user/details",
    method: MethodType.GET,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/user/refresh",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/user/logout",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
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
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category/id/*",
    method: MethodType.DELETE,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category/id/*/status/enable",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/expense-category/id/*/status/disable",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type",
    method: MethodType.GET,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type/id/*",
    method: MethodType.DELETE,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type/id/*/status/enable",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/pymt-account-type/id/*/status/disable",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/currency-profile",
    method: MethodType.GET,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/currency-profile",
    method: MethodType.POST,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/currency-profile/id/*",
    method: MethodType.DELETE,
    role: [Role.ADMIN, Role.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/currency-profile/id/*/status/enable",
    method: MethodType.POST,
    role: [Role.ADMIN],
  },
];

export const RoleAuthConfigList: RoleAuthorizeConfigType[] = [...UserUriAuthConfigList, ...ConfigTypeUriAuthConfigList];
