import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AwsInfraEnvironment } from "../lib/aws-infra-env.enum";
import { HelloCdkStack } from "../lib/hello-cdk-stack";

// example test. To run these tests, uncomment this file along with the
// example resource in lib/hello-cdk-stack.ts
test("SQS Queue Created", () => {
  const app = new App();
  // WHEN
  // const stack = new HelloCdkStack(app, "MyTestStack", {
  //   infraEnv: AwsInfraEnvironment.UNKNOWN,
  //   appId: "dmyapp",
  // });
  // THEN
  // const template = Template.fromStack(stack);

  // template.hasResourceProperties("AWS::SQS::Queue", {
  //   VisibilityTimeout: 300,
  // });
});
