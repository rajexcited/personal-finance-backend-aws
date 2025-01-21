export enum InfraEnvironmentId {
  Development = "dev",
  Test = "tst",
  Production = "prd",
  UNKNOWN = "undefined"
}

export const getValidInfraEnvironment = () => {
  const infraEnv = <InfraEnvironmentId>process.env.INFRA_ENV;
  if ([InfraEnvironmentId.UNKNOWN, InfraEnvironmentId.Development, InfraEnvironmentId.Test, InfraEnvironmentId.Production].includes(infraEnv)) {
    return infraEnv;
  }
  throw new Error("valid infra env not provided, found this [" + infraEnv + "]");
};
