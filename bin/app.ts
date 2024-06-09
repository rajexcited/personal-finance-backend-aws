#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { MyFinanceAppStack, MyFinanceWebAclAppStack, EnvironmentName, ConstructProps, MyFinanceUiDeployAppStack } from "../src/infra-lib";

const envId = <EnvironmentName>String(process.env.ENV);
if (envId === EnvironmentName.UNKNOWN) throw new Error("Unknown environment");

const app = new App();
const props: ConstructProps = { environment: envId, resourcePrefix: "myfinance" };

const webAclStack = new MyFinanceWebAclAppStack(app, "MyFinanceWebAclAppStack", {
  stackName: ["app", envId, "myfinance", "webacl", "app", "stack"].join("-"),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  ...props,
});

// after deploying app stack, run invalidate cf cli to clear s3 caching for error paths.
// do not required to invalidate on every deployment. run cli only if changes in error templates of s3
// https://awscli.amazonaws.com/v2/documentation/api/latest/reference/cloudfront/create-invalidation.html
const myFinanceStack = new MyFinanceAppStack(app, "MyFinanceAppStack", {
  stackName: ["app", envId, "myfinance", "app", "stack"].join("-"),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  ...props,
  webAclId: webAclStack.webAclId,
  crossRegionReferences: true,
});

// after deploying ui stack, run invalidate cf cli to clear s3 caching.
// invalidate all paths deployed here
// https://awscli.amazonaws.com/v2/documentation/api/latest/reference/cloudfront/create-invalidation.html
const uiDeployStack = new MyFinanceUiDeployAppStack(app, "MyFinanceUiDeployAppStack", {
  stackName: ["app", envId, "myfinance", "ui", "deploy", "app", "stack"].join("-"),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  ...props,
  uiBucketArn: myFinanceStack.uiBucketArn,
});

const tags = [
  { key: "environment", value: envId },
  { key: "app", value: "my-finance" },
  { key: "purpose", value: "finance" },
];

tags.forEach(({ key, value }) => Tags.of(app).add(key, value));
