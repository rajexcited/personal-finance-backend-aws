import { Construct } from "constructs";
import { AttributeType, TableV2, TableClass, ProjectionType } from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, EnvironmentName } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";

/**
 * Dynamodb to manage user's config type
 *  partition Key: id
 *
 * Attributes:
 * id, userId, belongsTo, createdOn, updatedOn,
 *  details (json: name, value, description, status, updatedBy, createdBy)
 */
export class ConfigTypeDBConstruct extends Construct {
  public readonly cfgTypDb: TableV2;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const db = new TableV2(this, "ConfigTypeDynamoDb", {
      tableName: [props.environment, "config", "type", "dynamodb"].join("-"),
      partitionKey: { name: "id", type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === EnvironmentName.Production,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    db.addLocalSecondaryIndex({
      indexName: ["filter", "by", "user", "index"].join("-"),
      sortKey: { name: "userId", type: AttributeType.STRING },
      nonKeyAttributes: ["id", "userId", "belongsTo"],
      projectionType: ProjectionType.INCLUDE,
    });

    this.cfgTypDb = db;
  }
}
