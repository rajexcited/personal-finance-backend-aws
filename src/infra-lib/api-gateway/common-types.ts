export interface RequestParametersType {
  [param: string]: boolean;
}

export const getQueryParamType = (param: string) => {
  return `method.request.querystring.${param}`;
};
