import { Construct } from "constructs";
import { AttributeType, TableV2, TableClass, ProjectionType } from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, EnvironmentName } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";

/**
 * Dynamodb to manage user's Payment account
 *  partition Key: id
 *
 * Index: createdOn-index
 *  partition Key: createdOn
 *
 * Attributes:
 * id, createdOn, updatedOn,
 *  details (json: accNum, shortName, accName, accTypeId, tags, institutionName, description, updatedBy, createdBy)
 */
export class ExpenseDBConstruct extends Construct {
  public readonly pymtAccDb: TableV2;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const db = new TableV2(this, "PymtAccountDynamoDb", {
      tableName: [props.environment, "pymt", "acc", "dynamodb"].join("-"),
      partitionKey: { name: "id", type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === EnvironmentName.Production,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    db.addLocalSecondaryIndex({
      indexName: ["filter", "by", "user", "index"].join("-"),
      sortKey: { name: "userId", type: AttributeType.STRING },
      projectionType: ProjectionType.KEYS_ONLY,
    });

    db.addGlobalSecondaryIndex({
      indexName: ["createdOn", "index"].join("-"),
      partitionKey: { name: "createdOn", type: AttributeType.STRING },
    });

    this.pymtAccDb = db;
  }
}
