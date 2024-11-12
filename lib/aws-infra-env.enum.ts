export enum AwsInfraEnvironment {
  TEST = "tst",
}

export const getValidAwsInfraEnvironment = () => {
  const infraEnv = <AwsInfraEnvironment>process.env.INFRA_ENV;
  if ([AwsInfraEnvironment.TEST].includes(infraEnv)) {
    return infraEnv;
  }
  throw new Error("valid infra env not provided");
};
