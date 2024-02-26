import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { OrdersDBConstruct } from "./order-history-dynamodb";
import { EnvironmentType } from "./env-enum";
import { OrderApiConstruct } from "./order-api-gateway";

interface AppStackProps extends StackProps {
  environment: EnvironmentType;
}

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // create order history db
    const orderDb = new OrdersDBConstruct(this, "OrderDbConstruct", {
      environment: props.environment,
    });
    // create api gateway
    // get list of orders, order item. create / update / delete order
    const OrdersApi = new OrderApiConstruct(this, "OrderApiConstruct", {
      environment: props.environment,
      orderDb: orderDb.orderDb,
    });
    // upload image, textextract to invoice details, retireve image
    // public url, secured url
  }
}
