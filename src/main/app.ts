#!/usr/bin/env node
import "source-map-support/register";
import { App, Tags } from "aws-cdk-lib";
import { AppStack, EnvironmentName } from "../infra-lib";

const envId = <EnvironmentName>String(process.env.ENV);
if (envId === EnvironmentName.UNKNOWN) throw new Error("Unknown environment");

const app = new App();

const myFinanceStack = new AppStack(app, "MyFinanceAppStack", {
  stackName: ["app", envId, "my-finance", "stack"].join("-"),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  environment: envId,
});

const tags = [
  { key: "environment", value: envId },
  { key: "app", value: "my-finance" },
  { key: "purpose", value: "finance" },
];

tags.forEach(({ key, value }) => Tags.of(app).add(key, value));
