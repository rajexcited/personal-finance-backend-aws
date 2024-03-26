import { Construct } from "constructs";
import { AttributeType, TableV2, TableClass, ProjectionType } from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, EnvironmentName } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";
import { DbProps } from "./db-prop-type";

/**
 * Dynamodb to manage user's config type
 *
 * wiki design:
 *    https://github.com/rajexcited/personal-finance-backend-aws/wiki/Config-Table
 *
 */
export class ConfigTypeDBConstruct extends Construct {
  public readonly cfgTypTable: DbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const tablePartitionKeyName = "PK";
    const db = new TableV2(this, "ConfigTypeDynamoDb", {
      tableName: [props.resourcePrefix, props.environment, "cfg", "type", "dynamodb"].join("-"),
      partitionKey: { name: tablePartitionKeyName, type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === EnvironmentName.Production,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const gsiProp = {
      indexName: ["userId", "belongsTo", "index"].join("-"),
      partitionKey: { name: "UB_GSI_PK", type: AttributeType.STRING },
      sortKey: { name: tablePartitionKeyName, type: AttributeType.STRING },
      nonKeyAttributes: ["STATUS"],
      projectionType: ProjectionType.INCLUDE,
    };
    db.addGlobalSecondaryIndex(gsiProp);

    this.cfgTypTable = {
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
