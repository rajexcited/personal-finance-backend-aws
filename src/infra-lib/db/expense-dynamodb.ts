import { Construct } from "constructs";
import {
  AttributeType,
  TableV2,
  TableClass,
  ProjectionType,
  GlobalSecondaryIndexPropsV2,
} from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, EnvironmentName } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";
import { DbProps } from "./db-prop-type";

/**
 * Dynamodb to manage user's expenses
 *
 * wiki design:
 *    https://github.com/rajexcited/personal-finance-backend-aws/wiki/Expense-Table
 *
 */
export class ExpenseDBConstruct extends Construct {
  public readonly expenseTable: DbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const tablePartitionKeyName = "PK";
    const tableSortKeyName = "SK";
    const db = new TableV2(this, "ExpenseDynamoDb", {
      tableName: [props.resourcePrefix, props.environment, "expenses", "dynamodb"].join("-"),
      partitionKey: { name: tablePartitionKeyName, type: AttributeType.STRING },
      sortKey: { name: tableSortKeyName, type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === EnvironmentName.Production,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const gsiProp: GlobalSecondaryIndexPropsV2 = {
      indexName: ["userId", "expenseId", "index"].join("-"),
      partitionKey: { name: "UE_GSI_PK", type: AttributeType.STRING },
      sortKey: { name: tablePartitionKeyName, type: AttributeType.STRING },
      projectionType: ProjectionType.KEYS_ONLY,
    };
    db.addGlobalSecondaryIndex(gsiProp);

    this.expenseTable = {
      table: {
        ref: db,
        name: db.tableName,
      },
      globalSecondaryIndexes: {
        userIdExpenseIdIndex: {
          name: gsiProp.indexName,
        },
      },
    };
  }
}
