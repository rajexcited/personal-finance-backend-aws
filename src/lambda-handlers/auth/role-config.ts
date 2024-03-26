import { MethodType } from "../http-method-type";
import { Role } from "./auth-type";

interface RoleAuthorizeConfigType {
  apiPath: string;
  method: MethodType;
  role: Role[];
}

export const roleAuthConfigList: RoleAuthorizeConfigType[] = [
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
