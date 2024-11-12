export enum AwsInfraEnvironment {
  TEST = "tst",
  UNKNOWN = "unknown",
}

export const getValidAwsInfraEnvironment = () => {
  const infraEnv = <AwsInfraEnvironment>process.env.INFRA_ENV;
  if ([AwsInfraEnvironment.TEST, AwsInfraEnvironment.UNKNOWN].includes(infraEnv)) {
    return infraEnv;
  }
  throw new Error("valid infra env not provided");
};
