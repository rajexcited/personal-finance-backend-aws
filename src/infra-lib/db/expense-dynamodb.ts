import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, InfraEnvironmentId, buildResourceName, AwsResourceType } from "../common";
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

    const db = new dynamodb.Table(this, "ExpenseTableDynamoDb", {
      tableName: buildResourceName(["expense"], AwsResourceType.Dynamodb, props),
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === InfraEnvironmentId.Production,
      timeToLiveAttribute: "ExpiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const gsiProp: dynamodb.GlobalSecondaryIndexProps = {
      indexName: buildResourceName(["userId", "status"], AwsResourceType.GlobalSecondaryIndex),
      partitionKey: { name: "US_GSI_PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "US_GSI_SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ["US_GSI_BELONGSTO"],
    };
    db.addGlobalSecondaryIndex(gsiProp);

    this.expenseTable = {
      table: {
        ref: db,
        name: db.tableName,
      },
      globalSecondaryIndexes: {
        userIdStatusIndex: {
          name: gsiProp.indexName,
        },
      },
    };
  }
}
