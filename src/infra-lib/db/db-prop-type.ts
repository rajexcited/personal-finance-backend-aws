import { TableV2 } from "aws-cdk-lib/aws-dynamodb";

interface DbSecondaryIndex {
  name: string;
}

interface DbTableRef {
  ref: TableV2;
  name: string;
}

type IndexName = `${string}Index`;
type GlobalSecondaryIndexes = Record<IndexName, DbSecondaryIndex>;

interface DbProps {
  table: DbTableRef;
  globalSecondaryIndexes: GlobalSecondaryIndexes;
}

export interface ConfigDbProps extends DbProps {
  globalSecondaryIndexes: Pick<GlobalSecondaryIndexes, "userIdBelongsToIndex">;
}

export interface ExpenseDbProps extends DbProps {
  globalSecondaryIndexes: Pick<GlobalSecondaryIndexes, "userIdStatusIndex">;
}

export interface PymtAccDbProps extends DbProps {
  globalSecondaryIndexes: Pick<GlobalSecondaryIndexes, "userIdStatusShortnameIndex">;
}

export interface UserDbProps extends DbProps {
  globalSecondaryIndexes: Pick<GlobalSecondaryIndexes, "emailIdIndex">;
}
