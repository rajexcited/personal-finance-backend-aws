import { Construct } from "constructs";
import { ConstructProps } from "../common";
import { UserDBConstruct } from "./user-dynamodb";
import { ExpenseDBConstruct } from "./expense-dynamodb";
import { PymtAccDBConstruct } from "./pymt-acc-dynamodb";
import { ConfigTypeDBConstruct } from "./config-type-dynamodb";
import { DbProps } from "./db-prop-type";

export class DBConstruct extends Construct {
  public readonly userTable: DbProps;
  public readonly expenseTable: DbProps;
  public readonly paymentAccountTable: DbProps;
  public readonly configTypeTable: DbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const userDb = new UserDBConstruct(this, "UserDbConstruct", { ...props });
    this.userTable = userDb.userTable;

    const expenseDb = new ExpenseDBConstruct(this, "ExpenseDbConstruct", { ...props });
    this.expenseTable = expenseDb.expenseTable;

    const pymtAccDb = new PymtAccDBConstruct(this, "PymtAccDbConstruct", { ...props });
    this.paymentAccountTable = pymtAccDb.pymtAccTable;

    const cfgTypDb = new ConfigTypeDBConstruct(this, "CfgTypDbConstruct", { ...props });
    this.configTypeTable = cfgTypDb.cfgTypTable;
  }
}
