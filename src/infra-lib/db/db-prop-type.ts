import { TableV2 } from "aws-cdk-lib/aws-dynamodb";

export interface DbSecondaryIndex {
  name: string;
}

interface DbTableRef {
  ref: TableV2;
  name: string;
}

export interface DbProps {
  table: DbTableRef;
  globalSecondaryIndexes: {
    [indexName: string]: DbSecondaryIndex;
  };
}
