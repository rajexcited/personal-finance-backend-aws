#!/usr/bin/env node
import "source-map-support/register";
import { App, Tags } from "aws-cdk-lib";
import { AppStack } from "../lib/app-stack";
import { EnvironmentType } from "../lib/env-enum";

const envId = <EnvironmentType>String(process.env.ENV);

const app = new App();
const stack = new AppStack(app, "AppStack", {
  stackName: [envId, "app", "poc", "stack"].join("-"),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  environment: envId,
});

const tags = [
  { key: "environment", value: envId },
  { key: "app", value: "test" },
  { key: "type", value: "poc" },
];

tags.forEach(({ key, value }) => Tags.of(app).add(key, value));
