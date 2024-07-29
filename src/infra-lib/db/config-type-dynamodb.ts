import { Construct } from "constructs";
import { AttributeType, TableV2, TableClass, ProjectionType, GlobalSecondaryIndexPropsV2 } from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, EnvironmentName, buildResourceName, AwsResourceType } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";
import { ConfigDbProps } from "./db-prop-type";

/**
 * Dynamodb to manage user's config type
 *
 * wiki design:
 *    https://github.com/rajexcited/personal-finance-backend-aws/wiki/Config-Table
 *
 */
export class ConfigTypeDBConstruct extends Construct {
  public readonly cfgTypTable: ConfigDbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const db = new TableV2(this, "ConfigTypeDynamoDb", {
      tableName: buildResourceName(["cfg", "type"], AwsResourceType.Dynamodb, props),
      partitionKey: { name: "PK", type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === EnvironmentName.Production,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const gsiProp: GlobalSecondaryIndexPropsV2 = {
      indexName: buildResourceName(["userId", "belongsTo"], AwsResourceType.GlobalSecondaryIndex),
      partitionKey: { name: "UB_GSI_PK", type: AttributeType.STRING },
      sortKey: { name: "UB_GSI_SK", type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    };
    db.addGlobalSecondaryIndex(gsiProp);

    this.cfgTypTable = {
      table: {
        ref: db,
        name: db.tableName,
      },
      globalSecondaryIndexes: {
        userIdBelongsToIndex: {
          name: gsiProp.indexName,
        },
      },
    };
  }
}
