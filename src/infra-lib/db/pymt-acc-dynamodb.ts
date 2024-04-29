import { Construct } from "constructs";
import { AttributeType, TableV2, TableClass, ProjectionType, GlobalSecondaryIndexPropsV2 } from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, EnvironmentName } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";
import { DbProps } from "./db-prop-type";

/**
 * Dynamodb to manage user's Payment account
 *
 * wiki design:
 *    https://github.com/rajexcited/personal-finance-backend-aws/wiki/Payment-Account-Table
 *
 */
export class PymtAccDBConstruct extends Construct {
  public readonly pymtAccTable: DbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const db = new TableV2(this, "PymtAccountDynamoDb", {
      tableName: [props.resourcePrefix, props.environment, "pymt", "acc", "dynamodb"].join("-"),
      partitionKey: { name: "PK", type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === EnvironmentName.Production,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const gsiProp: GlobalSecondaryIndexPropsV2 = {
      indexName: ["userId", "status", "shortName", "index"].join("-"),
      partitionKey: { name: "UP_GSI_PK", type: AttributeType.STRING },
      sortKey: { name: "UP_GSI_SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    };
    db.addGlobalSecondaryIndex(gsiProp);

    this.pymtAccTable = {
      table: {
        ref: db,
        name: db.tableName,
      },
      globalSecondaryIndexes: {
        userIdStatusShortnameIndex: {
          name: gsiProp.indexName,
        },
      },
    };
  }
}
