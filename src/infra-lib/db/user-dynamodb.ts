import { Construct } from "constructs";
import { AttributeType, TableV2, TableClass } from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, EnvironmentName } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";

/**
 * Dynamodb to manage user details
 *  partition Key: id
 *
 * Index: userName-index
 *  partition Key: userName
 *
 * Index: emailId-userName-index
 *  partition Key: userName
 *  sort Key: emailId
 *
 * Attributes:
 * id, userName, emailId, details (json: firstName, lastName, password, updatedBy, updatedOn, createdBy, createdOn)
 */
export class UserDBConstruct extends Construct {
  public readonly userDb: TableV2;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const db = new TableV2(this, "UserDynamoDb", {
      tableName: [props.environment, "user", "info", "dynamodb"].join("-"),
      partitionKey: { name: "id", type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === EnvironmentName.Production,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    db.addGlobalSecondaryIndex({
      indexName: ["userName", "index"].join("-"),
      partitionKey: { name: "userName", type: AttributeType.STRING },
    });
    db.addGlobalSecondaryIndex({
      indexName: ["userName", "emailId", "index"].join("-"),
      partitionKey: { name: "userName", type: AttributeType.STRING },
      sortKey: { name: "emailId", type: AttributeType.STRING },
    });

    this.userDb = db;
  }
}
