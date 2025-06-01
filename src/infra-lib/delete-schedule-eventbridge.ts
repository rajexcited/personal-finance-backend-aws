import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { AwsResourceType, buildResourceName, ConstructProps } from "./common";

interface DeleteStackScheduleProps extends ConstructProps {}

export class DeleteStackScheduleConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DeleteStackScheduleProps) {
    super(scope, id);

    const scheduleTime = new Date(process.env.DELETE_SCHEDULE_TIME || "");

    if (!isNaN(scheduleTime.getTime())) {
      console.error("delete schedule time is not provided.");
      return;
    }

    const stackResources = {
      INFRA_STACK: buildResourceName(["infra"], AwsResourceType.Stack, props),
      UI_STACK: buildResourceName(["ui", "deploy"], AwsResourceType.Stack, props)
    };

    const deleteStackLambda = new lambda.Function(this, "DeleteStackLambda", {
      functionName: buildResourceName(["delete", "stack"], AwsResourceType.Lambda, props),
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "delete_stack.lambda_handler",
      code: lambda.Code.fromAsset("src/lambda-py/power-schedule"),
      timeout: cdk.Duration.minutes(15),
      environment: {
        ...stackResources
      }
    });

    // Grant Lambda permission to delete CloudFormation stacks
    deleteStackLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DeleteStack"],
        resources: Object.values(stackResources).map(
          (stackName) => `arn:aws:cloudformation:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stack/${stackName}/*`
        )
      })
    );

    // EventBridge rule to trigger Lambda after 2 days
    const eventRule = new events.Rule(this, "DeleteStackScheduleEventRule", {
      schedule: events.Schedule.cron({
        year: scheduleTime.getFullYear() + "",
        month: scheduleTime.getMonth() + 1 + "",
        day: scheduleTime.getDate() + "",
        hour: scheduleTime.getHours() + "",
        minute: scheduleTime.getMinutes() + ""
      })
    });

    // Set Lambda as the target for the scheduled event
    eventRule.addTarget(new targets.LambdaFunction(deleteStackLambda));
  }
}
