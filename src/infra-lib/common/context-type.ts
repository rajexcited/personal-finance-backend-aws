export interface ExpenseReceiptContextInfo {
  temporaryKeyPrefix: string;
  finalizeReceiptKeyPrefix: string;
  deleteTags: Record<string, string>;
  expirationDays: {
    finalizeReceipt: number;
    temporaryReceipt: number;
  };
}

export interface ApigatewayContextInfo {
  stageName: string;
}

interface CfPathPrefixContextInfo {
  ui: string;
  errors: string;
  restApi: string;
}

export interface CloudFrontContextInfo {
  pathPrefix: CfPathPrefixContextInfo;
  geoRestriction?: {
    allowCountryCodes?: string[];
  };
  enableWebAcl: boolean;
  homepageUrl: string;
}

export interface ContextInfo {
  expenseReceipt: ExpenseReceiptContextInfo;
  apigateway: ApigatewayContextInfo;
  cloudfront: CloudFrontContextInfo;
}
