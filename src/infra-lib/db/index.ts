import { Construct } from "constructs";
import { ConstructProps } from "../common";
import { UserDBConstruct } from "./user-dynamodb";
import { ExpenseDBConstruct } from "./expense-dynamodb";

export class DBConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ConstructProps) {
    super(scope, id);

    const userDb = new UserDBConstruct(this, "UserDbConstruct", { ...props });
    const expenseDb = new ExpenseDBConstruct(this, "ExpenseDbConstruct", { ...props });
  }
}
