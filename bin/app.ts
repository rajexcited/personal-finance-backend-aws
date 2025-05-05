#!/usr/bin/env node
import { App, DefaultStackSynthesizer, Tags } from "aws-cdk-lib";
import { MyFinanceAppStack, ConstructProps, MyFinanceUiDeployAppStack } from "../src/infra-lib";
import { AwsResourceType, buildResourceName, getValidInfraEnvironment } from "../src/infra-lib/common";

const envId = getValidInfraEnvironment();
const appId = "prsfin";

const tagsMap = getAppTags(process.env.TAGS);

tagsMap["environment"] = envId;
tagsMap["appId"] = appId;
tagsMap["purpose"] = "finance";

const app = new App();
const props: ConstructProps = { environment: envId, appId: appId };

/**
 * commenting webacl to creating WAF service. as it is costing at least $8-12 monthly. and not sure if it is really needed.
 * AWS Shield service is applied to Cloudfront without cost, which shields many attacks.
 */
// const webAclStack = new MyFinanceWebAclAppStack(app, "MyFinanceWebAclAppStack", {
//   stackName: ["app", envId, "myfinance", "webacl", "app", "stack"].join("-"),
//   env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
//   ...props,
// });

// after deploying app stack, run invalidate cf cli to clear s3 caching for error paths.
// do not required to invalidate on every deployment. run cli only if changes in error templates of s3
// https://awscli.amazonaws.com/v2/documentation/api/latest/reference/cloudfront/create-invalidation.html
const myFinanceStack = new MyFinanceAppStack(app, "MyFinanceInfraStack", {
  stackName: buildResourceName(["infra"], AwsResourceType.Stack, props),
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  ...props,
  synthesizer: new DefaultStackSynthesizer({
    qualifier: appId + envId
  })
  // webAclId: webAclStack.webAclId,
  // crossRegionReferences: true,
});

// after deploying ui stack, run invalidate cf cli to clear s3 caching.
// invalidate all paths deployed here
// https://awscli.amazonaws.com/v2/documentation/api/latest/reference/cloudfront/create-invalidation.html
const uiDeployStack = new MyFinanceUiDeployAppStack(app, "MyFinanceUiDeployStack", {
  stackName: buildResourceName(["ui", "deploy"], AwsResourceType.Stack, props),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  ...props,
  synthesizer: new DefaultStackSynthesizer({
    qualifier: appId + envId
  }),
  uiBucketArn: myFinanceStack.uiBucketArn
});

console.log("tagsMap: ", tagsMap);
Object.entries(tagsMap).forEach(([key, value]) => Tags.of(app).add(key, value));

function getAppTags(tagsEnv?: string) {
  const tagMap: Record<string, string> = {};
  const tagsArray = convertTagsArray(tagsEnv);
  console.log("tagEnv: ", tagsEnv, "tagsArray: ", tagsArray);

  if (tagsArray.length === 0) {
    throw new Error(`there are no tags array provided. Comma-separated list of tags, set Env e.g. "TAGS=Key1=Value1,Key2=Value2"`);
  }
  for (let tag of tagsArray) {
    const [key, value] = tag.split("=");
    tagMap[key.trim()] = value.trim();
  }
  return tagMap;
}

function convertTagsArray(tagsEnv?: string) {
  if (!tagsEnv) {
    return [];
  }

  try {
    const tagsArray = JSON.parse(tagsEnv);
    if (Array.isArray(tagsArray)) {
      return tagsArray;
    }
  } catch (e) {}

  try {
    const tagsArray = tagsEnv.split(",");
    if (Array.isArray(tagsArray)) {
      return tagsArray;
    }
  } catch (e) {}

  return [];
}
