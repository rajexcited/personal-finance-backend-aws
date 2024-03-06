import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { EnvironmentName } from "./env-enum";
import { DBConstruct } from "./db";

interface AppStackProps extends StackProps {
  environment: EnvironmentName;
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const db = new DBConstruct(this, "DatabaseConstruct", { ...props });

    // upload image, textextract to invoice details, retireve image
    // public url, secured url
  }
}
