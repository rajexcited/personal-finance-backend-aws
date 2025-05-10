import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { ConstructProps, InfraEnvironmentId, buildResourceName, AwsResourceType } from "../common";
import { RemovalPolicy } from "aws-cdk-lib";
import { PymtAccDbProps } from "./db-prop-type";

/**
 * Dynamodb to manage user's Payment account
 *
 * wiki design:
 *    https://github.com/rajexcited/personal-finance-backend-aws/wiki/Payment-Account-Table
 *
 */
export class PymtAccDBConstruct extends Construct {
  public readonly pymtAccTable: PymtAccDbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const db = new dynamodb.Table(this, "PymtAccountDynamoDb", {
      tableName: buildResourceName(["pymt", "acc"], AwsResourceType.Dynamodb, props),
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.environment === InfraEnvironmentId.Production
      },
      removalPolicy: RemovalPolicy.DESTROY
    });

    const gsiProp: dynamodb.GlobalSecondaryIndexProps = {
      indexName: buildResourceName(["userId", "status", "shortName"], AwsResourceType.GlobalSecondaryIndex),
      partitionKey: { name: "UP_GSI_PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "UP_GSI_SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL
    };
    db.addGlobalSecondaryIndex(gsiProp);

    this.pymtAccTable = {
      table: {
        ref: db,
        name: db.tableName
      },
      globalSecondaryIndexes: {
        userIdStatusShortnameIndex: {
          name: gsiProp.indexName
        }
      }
    };
  }
}
