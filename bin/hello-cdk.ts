#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { HelloCdkStack } from "../lib/hello-cdk-stack";
import { getValidAwsInfraEnvironment } from "../lib/aws-infra-env.enum";

const app = new cdk.App();
const infraEnv = getValidAwsInfraEnvironment();
const appId = "prsfin";

const stack1 = new HelloCdkStack(app, "HelloCdkStack", {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  synthesizer: new cdk.DefaultStackSynthesizer({
    qualifier: `${appId}-${infraEnv}`,
  }),

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  infraEnv: infraEnv,
  appId: appId,
});

const tags = [
  { key: "environment", value: infraEnv },
  { key: "app", value: "hellocdk" },
  { key: "appId", value: appId },
];

tags.forEach(({ key, value }) => cdk.Tags.of(app).add(key, value));
