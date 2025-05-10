import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, InfraEnvironmentId, buildResourceName, AwsResourceType } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";
import { UserDbProps } from "./db-prop-type";

/**
 * Dynamodb to manage user details
 *
 * wiki design:
 *    https://github.com/rajexcited/personal-finance-backend-aws/wiki/User-Table
 */
export class UserDBConstruct extends Construct {
  public readonly userTable: UserDbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const db = new dynamodb.Table(this, "UserDynamoDb", {
      tableName: buildResourceName(["user", "info"], AwsResourceType.Dynamodb, props),
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.environment === InfraEnvironmentId.Production
      },
      timeToLiveAttribute: "ExpiresAt",
      removalPolicy: RemovalPolicy.DESTROY
    });

    const emailIdGsiProp: dynamodb.GlobalSecondaryIndexProps = {
      indexName: buildResourceName(["emailId"], AwsResourceType.GlobalSecondaryIndex),
      partitionKey: { name: "E_GSI_PK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY
    };
    db.addGlobalSecondaryIndex(emailIdGsiProp);

    this.userTable = {
      table: {
        ref: db,
        name: db.tableName
      },
      globalSecondaryIndexes: {
        emailIdIndex: {
          name: emailIdGsiProp.indexName
        }
      }
    };
  }
}
