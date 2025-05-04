import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, InfraEnvironmentId, buildResourceName, AwsResourceType } from "../common";
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

    const db = new dynamodb.Table(this, "ConfigTypeDynamoDb", {
      tableName: buildResourceName(["cfg", "type"], AwsResourceType.Dynamodb, props),
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.environment === InfraEnvironmentId.Production
      },
      removalPolicy: RemovalPolicy.DESTROY
    });

    const gsiProp: dynamodb.GlobalSecondaryIndexProps = {
      indexName: buildResourceName(["userId", "belongsTo"], AwsResourceType.GlobalSecondaryIndex),
      partitionKey: { name: "UB_GSI_PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "UB_GSI_SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL
    };
    db.addGlobalSecondaryIndex(gsiProp);

    this.cfgTypTable = {
      table: {
        ref: db,
        name: db.tableName
      },
      globalSecondaryIndexes: {
        userIdBelongsToIndex: {
          name: gsiProp.indexName
        }
      }
    };
  }
}
