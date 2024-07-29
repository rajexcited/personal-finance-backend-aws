import { Construct } from "constructs";
import { AttributeType, TableV2, TableClass, ProjectionType, GlobalSecondaryIndexPropsV2 } from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, EnvironmentName, buildResourceName, AwsResourceType } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";
import { ExpenseDbProps } from "./db-prop-type";

/**
 * Dynamodb to manage user's expenses
 *
 * wiki design:
 *    https://github.com/rajexcited/personal-finance-backend-aws/wiki/Expense-Table
 *
 */
export class ExpenseDBConstruct extends Construct {
  public readonly expenseTable: ExpenseDbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const db = new TableV2(this, "ExpenseDynamoDb", {
      tableName: buildResourceName(["expenses"], AwsResourceType.Dynamodb, props),
      partitionKey: { name: "PK", type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === EnvironmentName.Production,
      timeToLiveAttribute: "ExpiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const gsiProp: GlobalSecondaryIndexPropsV2 = {
      indexName: buildResourceName(["userId", "status", "date"], AwsResourceType.GlobalSecondaryIndex),
      partitionKey: { name: "UD_GSI_PK", type: AttributeType.STRING },
      sortKey: { name: "UD_GSI_SK", type: AttributeType.STRING },
      projectionType: ProjectionType.INCLUDE,
      nonKeyAttributes: ["UD_GSI_ATTR1"],
    };
    db.addGlobalSecondaryIndex(gsiProp);

    this.expenseTable = {
      table: {
        ref: db,
        name: db.tableName,
      },
      globalSecondaryIndexes: {
        userIdStatusDateIndex: {
          name: gsiProp.indexName,
        },
      },
    };
  }
}
