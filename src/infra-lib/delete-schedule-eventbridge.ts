import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { AwsResourceType, buildResourceName, ConstructProps, InfraEnvironmentId } from "./common";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

interface DeleteStackScheduleProps extends ConstructProps {}

export class DeleteStackScheduleConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DeleteStackScheduleProps) {
    super(scope, id);

    if (props.environment === InfraEnvironmentId.Production) {
      console.error("delete stack schedule is not supported for production. ignoring the request");
      return;
    }

    const deleteScheduleTime = process.env.DELETE_SCHEDULE_TIME || "";
    let scheduleTime = new Date(deleteScheduleTime);
    const cronRegex = /cron\((\d+)\s(\d+)\s(\d+)\s(\*)\s\?\s(\*)\)/;
    if (cronRegex.test(deleteScheduleTime)) {
      const cronParts = cronRegex.exec(deleteScheduleTime);
      if (cronParts) {
        scheduleTime = new Date();
        scheduleTime.setMinutes(Number(cronParts[1]));
        scheduleTime.setHours(Number(cronParts[2]));
        scheduleTime.setDate(Number(cronParts[3]));
      }
    }

    if (isNaN(scheduleTime.getTime())) {
      console.error("delete schedule time is not provided.", "deleteScheduleTime=", deleteScheduleTime);
      return;
    }

    const beforeDate = new Date();
    beforeDate.setMinutes(beforeDate.getMinutes() + 15);
    if (scheduleTime <= beforeDate) {
      console.error(
        "scheduled deletion is in past. schedule deletion event rule configuration is not allowed.",
        "deleteScheduleTime=",
        scheduleTime.toString(),
        "beforeDate=",
        beforeDate.toString()
      );
      throw new Error("scheduled auto delete buffer time is not supported.");
    }

    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() + 30);
    if (scheduleTime > afterDate) {
      console.error(
        "scheduled deletion is more than a month. schedule deletion event rule configuration is not allowed.",
        "deleteScheduleTime=",
        scheduleTime.toString(),
        "afterDate=",
        afterDate.toString()
      );
      throw new Error("scheduled auto delete buffer time is not supported.");
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
      logRetention: RetentionDays.ONE_MONTH,
      environment: {
        ...stackResources
      }
    });

    // Grant Lambda permission to delete CloudFormation stacks
    deleteStackLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DeleteStack", "cloudformation:DescribeStacks"],
        resources: Object.values(stackResources).map(
          (stackName) => `arn:aws:cloudformation:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stack/${stackName}/*`
        )
      })
    );

    // EventBridge rule to trigger Lambda after 2 days
    const eventRule = new events.Rule(this, "DeleteStackScheduleEventRule", {
      ruleName: buildResourceName(["delete", "stack", "schedule"], AwsResourceType.EventBridgeRule, props),
      schedule: events.Schedule.cron({
        day: scheduleTime.getDate() + "",
        hour: scheduleTime.getHours() + "",
        minute: scheduleTime.getMinutes() + ""
      })
    });

    // Set Lambda as the target for the scheduled event
    eventRule.addTarget(new targets.LambdaFunction(deleteStackLambda));
  }
}
