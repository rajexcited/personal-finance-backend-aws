import { Construct } from "constructs";
import { ConstructProps } from "../common";
import { UserDBConstruct } from "./user-dynamodb";
import { ExpenseDBConstruct } from "./expense-dynamodb";
import { PymtAccDBConstruct } from "./pymt-acc-dynamodb";
import { ConfigTypeDBConstruct } from "./config-type-dynamodb";
import { ConfigDbProps, ExpenseDbProps, PymtAccDbProps, UserDbProps } from "./db-prop-type";

export { UserDbProps, ConfigDbProps, ExpenseDbProps, PymtAccDbProps } from "./db-prop-type";

export class DBConstruct extends Construct {
  public readonly userTable: UserDbProps;
  public readonly expenseTable: ExpenseDbProps;
  public readonly paymentAccountTable: PymtAccDbProps;
  public readonly configTypeTable: ConfigDbProps;

  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const userDb = new UserDBConstruct(this, "UserDbConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
    });
    this.userTable = userDb.userTable;

    const expenseDb = new ExpenseDBConstruct(this, "ExpenseDbConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
    });
    this.expenseTable = expenseDb.expenseTable;

    const pymtAccDb = new PymtAccDBConstruct(this, "PymtAccDbConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
    });
    this.paymentAccountTable = pymtAccDb.pymtAccTable;

    const cfgTypDb = new ConfigTypeDBConstruct(this, "CfgTypDbConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
    });
    this.configTypeTable = cfgTypDb.cfgTypTable;
  }
}
