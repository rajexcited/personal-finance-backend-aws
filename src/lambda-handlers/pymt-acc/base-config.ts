import { getLogger } from "../utils";

export const _pymtAccTableName = process.env.PYMT_ACC_TABLE_NAME as string;
export const _logger = getLogger("pymt-acc");

export const getDetailsTablePk = (pymtAccId: string) => {
  return `pymtAccId#${pymtAccId}`;
};

export const getUserIdGsiPk = (userId: string) => {
  return `userId#${userId}`;
};
