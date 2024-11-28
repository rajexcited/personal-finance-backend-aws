export enum AwsInfraEnvironment {
  TEST = "tst",
  Development = "dev",
  UNKNOWN = "unknown",
}

export const getValidAwsInfraEnvironment = () => {
  const infraEnv = <AwsInfraEnvironment>process.env.INFRA_ENV;
  if ([AwsInfraEnvironment.TEST, AwsInfraEnvironment.UNKNOWN, AwsInfraEnvironment.Development].includes(infraEnv)) {
    return infraEnv;
  }
  throw new Error("valid infra env not provided");
};
