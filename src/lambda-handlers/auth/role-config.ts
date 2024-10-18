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
    apiPath: "/user/details",
    method: MethodType.DELETE,
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

const PurchaseTypeConfigUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/config/types/belongs-to/purchase-type",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/purchase-type/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/purchase-type",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/purchase-type/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/purchase-type/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/purchase-type/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/purchase-type/id/*/status/disable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

const IncomeTypeConfigUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/config/types/belongs-to/income-type",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/income-type/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/income-type",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/income-type/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/income-type/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/income-type/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/income-type/id/*/status/disable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

const RefundReasonConfigUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/config/types/belongs-to/refund-reason",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/refund-reason/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/refund-reason",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/refund-reason/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/refund-reason/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/refund-reason/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/refund-reason/id/*/status/disable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

const InvestmentTypeConfigUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/config/types/belongs-to/investment-type",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/investment-type/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/investment-type",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/investment-type/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/investment-type/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/investment-type/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/investment-type/id/*/status/disable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

const SharePersonConfigUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/config/types/belongs-to/share-person",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/share-person/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/share-person",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/share-person/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/share-person/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/share-person/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/config/types/belongs-to/share-person/id/*/status/disable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

const PymtAccountTypeConfigUriAuthConfigList: RoleAuthorizeConfigType[] = [
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
];

const CurrencyProfileConfigUriAuthConfigList: RoleAuthorizeConfigType[] = [
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

const ConfigTypeUriAuthConfigList: RoleAuthorizeConfigType[] = [
  ...PurchaseTypeConfigUriAuthConfigList,
  ...IncomeTypeConfigUriAuthConfigList,
  ...RefundReasonConfigUriAuthConfigList,
  ...InvestmentTypeConfigUriAuthConfigList,
  ...SharePersonConfigUriAuthConfigList,
  ...PymtAccountTypeConfigUriAuthConfigList,
  ...CurrencyProfileConfigUriAuthConfigList,
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

const ExpenseListUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/expenses",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/count",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

const PurchaseUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/expenses/purchase",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/purchase/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/purchase/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/purchase/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/purchase/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/purchase/id/*/receipts/id/*",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/purchase/id/*/receipts/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

const IncomeUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/expenses/income",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/income/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/income/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/income/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/income/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/income/id/*/receipts/id/*",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/income/id/*/receipts/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

const RefundUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/expenses/refund",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/refund/tags",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/refund/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/refund/id/*",
    method: MethodType.DELETE,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/refund/id/*/status/enable",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/refund/id/*/receipts/id/*",
    method: MethodType.POST,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/expenses/refund/id/*/receipts/id/*",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

const ExpenseUriAuthConfigList: RoleAuthorizeConfigType[] = [
  ...ExpenseListUriAuthConfigList,
  ...PurchaseUriAuthConfigList,
  ...IncomeUriAuthConfigList,
  ...RefundUriAuthConfigList,
];

const StatsUriAuthConfigList: RoleAuthorizeConfigType[] = [
  {
    apiPath: "/stats/purchase",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/stats/refund",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
  {
    apiPath: "/stats/income",
    method: MethodType.GET,
    role: [AuthRole.ADMIN, AuthRole.PRIMARY],
  },
];

export const RoleAuthConfigList: RoleAuthorizeConfigType[] = [
  ...UserUriAuthConfigList,
  ...ConfigTypeUriAuthConfigList,
  ...PymtAccUriAuthConfigList,
  ...ExpenseUriAuthConfigList,
  ...StatsUriAuthConfigList,
];
