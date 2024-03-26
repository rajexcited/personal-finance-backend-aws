import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DBConstruct } from "./db";
import { ConstructProps } from "./common";
import { ApiConstruct } from "./api-gateway";

/*
 * https://awscli.amazonaws.com/v2/documentation/api/latest/reference/kms/list-aliases.html#examples
 */

/**
 * stack props
 */
interface AppStackProps extends StackProps, ConstructProps {}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const allDbs = new DBConstruct(this, "DatabaseConstruct", { ...props });
    const allApis = new ApiConstruct(this, "RestApiConstruct", {
      ...props,
      allDb: allDbs,
    });

    // upload image, textextract to invoice details, retireve image
    // public url, secured url
  }
}
