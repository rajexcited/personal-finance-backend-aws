import { Construct } from "constructs";
import { AttributeType, TableV2, TableClass, ProjectionType, GlobalSecondaryIndexPropsV2 } from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, EnvironmentName } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";
import { DbProps } from "./db-prop-type";

/**
 * Dynamodb to manage user details
 *
 * wiki design:
 *    https://github.com/rajexcited/personal-finance-backend-aws/wiki/User-Table
 */
export class UserDBConstruct extends Construct {
  public readonly userTable: DbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const db = new TableV2(this, "UserDynamoDb", {
      tableName: [props.resourcePrefix, props.environment, "user", "info", "dynamodb"].join("-"),
      partitionKey: { name: "PK", type: AttributeType.STRING },
      tableClass: TableClass.STANDARD_INFREQUENT_ACCESS,
      pointInTimeRecovery: props.environment === EnvironmentName.Production,
      timeToLiveAttribute: "ExpiresAt",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const emailIdGsiProp: GlobalSecondaryIndexPropsV2 = {
      indexName: ["emailId", "index"].join("-"),
      partitionKey: { name: "E_GSI_PK", type: AttributeType.STRING },
      projectionType: ProjectionType.KEYS_ONLY,
    };
    db.addGlobalSecondaryIndex(emailIdGsiProp);

    this.userTable = {
      table: {
        ref: db,
        name: db.tableName,
      },
      globalSecondaryIndexes: {
        emailIdIndex: {
          name: emailIdGsiProp.indexName,
        },
      },
    };
  }
}
