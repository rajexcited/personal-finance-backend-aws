import { Construct } from "constructs";
import { RestApiProps } from "../construct-type";
import { DBConstruct } from "../../db";
import { ExpenseListApiConstruct } from "./expense-list-api-gateway";
import { ExpenseCrudApiConstruct } from "./expense-crud-api-gateway";
import { ExpenseReceiptContextInfo } from "../../common";
import { IBucket } from "aws-cdk-lib/aws-s3";

interface ExpenseApiProps extends RestApiProps {
  allDb: DBConstruct;
  expenseReceiptContext: ExpenseReceiptContextInfo;
  receiptBucket: IBucket;
}

export class ExpenseApiConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ExpenseApiProps) {
    super(scope, id);

    const expensesResource = props.apiResource.addResource("expenses");

    const expenseApi = new ExpenseListApiConstruct(this, "ExpenseListApiConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
      authorizer: props.authorizer,
      restApi: props.restApi,
      apiResource: props.apiResource,
      layer: props.layer,
      userTable: props.allDb.userTable,
      expenseTable: props.allDb.expenseTable,
      expenseResource: expensesResource,
      configTypeTable: props.allDb.configTypeTable,
    });

    const expenseCrudApi = new ExpenseCrudApiConstruct(this, "PurchaseApiConstruct", {
      environment: props.environment,
      resourcePrefix: props.resourcePrefix,
      authorizer: props.authorizer,
      restApi: props.restApi,
      apiResource: props.apiResource,
      layer: props.layer,
      userTable: props.allDb.userTable,
      expenseTable: props.allDb.expenseTable,
      configTypeTable: props.allDb.configTypeTable,
      pymtAccTable: props.allDb.paymentAccountTable,
      expenseReceiptContext: props.expenseReceiptContext,
      expenseResource: expensesResource,
      receiptBucket: props.receiptBucket,
    });

    // end
  }
}
