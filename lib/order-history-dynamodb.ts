import { Construct } from "constructs";
import { AttributeType, TableV2, TableClass } from "aws-cdk-lib/aws-dynamodb";
import { EnvironmentType } from "./env-enum";
import { RemovalPolicy } from "aws-cdk-lib";

interface OrdersDBProps {
  environment: EnvironmentType;
}

export class OrdersDBConstruct extends Construct {
  public readonly orderDb: TableV2;

  constructor(scope: Construct, id: string, props: OrdersDBProps) {
    super(scope, id);

    const db = new TableV2(this, "OrderDynamoDb", {
      tableName: [props.environment, "order", "history", "dynamodb"].join("-"),
      partitionKey: { name: "id", type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    this.orderDb = db;
  }
}
