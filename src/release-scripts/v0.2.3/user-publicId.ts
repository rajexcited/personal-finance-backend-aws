import { JSONObject } from "../../lambda-handlers";
import { DbItemUser } from "../../lambda-handlers/user/resource-type";
import { dbutil, getLogger, LoggerBase } from "../../lambda-handlers/utils";
import { v4 as uuidv4 } from "uuid";

const _userTableName = process.env.USER_TABLE_NAME as string;

const findActiveUsers = async (loggerBase: LoggerBase, lastEvaluatedKey?: Record<string, any>) => {
  const logger = getLogger("findActiveUsers", loggerBase);
  const allUsers = await dbutil.scan<DbItemUser>(logger, { TableName: _userTableName, ExclusiveStartKey: lastEvaluatedKey });
  const activeUsers = allUsers.Items.filter((u) => u.details.status === "active");
  return { users: activeUsers, lastEvaluatedKey: allUsers.LastEvaluatedKey };
};

const validateInput = () => {
  if (!_userTableName) {
    throw new Error("USER_TABLE_NAME environment variable is not set");
  }
};

const addPublicIdTouserDetails = async () => {
  const logger = getLogger("addPublicIdTouserDetails", null, null, "DEBUG");
  validateInput();
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;
  let totalUpdated = 0;
  const transactionWriter = new dbutil.TransactionWriter(logger);

  do {
    const { users, lastEvaluatedKey: newLastEvaluatedKey } = await findActiveUsers(logger, lastEvaluatedKey);
    lastEvaluatedKey = newLastEvaluatedKey;

    for (const user of users) {
      user.details.publicId = uuidv4();
      transactionWriter.putItems(user as unknown as JSONObject, _userTableName, logger);
      totalUpdated++;
    }
  } while (lastEvaluatedKey);

  await transactionWriter.executeTransaction();
  logger.info(`Total users updated: ${totalUpdated}`);
};

/*
Run Command:

npx cross-env USER_TABLE_NAME=<dynamodb-resource-name> ts-node src\release-scripts\v0.2.3\user-publicId.ts
*/

addPublicIdTouserDetails();
