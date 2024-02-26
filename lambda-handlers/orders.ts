import { Handler, Context, APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { TranslateConfig, DynamoDBDocument, ScanCommandOutput, BatchGetCommandInput } from "@aws-sdk/lib-dynamodb";
import { uuid } from "uuidv4";

const translateConfig: TranslateConfig = {
  marshallOptions: {
    convertClassInstanceToMap: true,
    convertEmptyValues: false,
    convertTopLevelContainer: true,
    removeUndefinedValues: true,
  },
};
const client = new DynamoDBClient();
const ddbClient = DynamoDBDocument.from(client, translateConfig);
const tableName = process.env.TABLE_NAME;

interface ItemType {
  id: string;
  category: string;
  price: number;
  quantity: number;
  percentDiscount: number;
}

interface ReturnItemType extends ItemType {
  returnedQuantity: number;
}

interface AuditDataType {
  createdBy: string;
  updatedBy: string;
  createdOn: Date;
  updatedOn: Date;
}

interface OrderItemType extends AuditDataType {
  id: string;
  items: ItemType[];
  totalPrice: number;
  totalQuantity: number;
  payment: {
    paidDate: Date;
    refId: string;
  };
  shippingAddress: string;
  returnedItems: ReturnItemType[];
}

export const createItem: Handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log("event", JSON.stringify(event, null, 2));
  console.log("context", JSON.stringify(context, null, 2));
  try {
    const validatedRequest = validateAndGetOrderRequestObject(event);
    if ("statusCode" in validatedRequest) return validatedRequest;

    validatedRequest.id = uuid();
    const response = await ddbClient.put({ TableName: tableName, Item: validatedRequest });
    console.log("createItem", response);

    return {
      statusCode: 200,
      body: JSON.stringify(validatedRequest),
    };
  } catch (err) {
    console.error("error getting list of order", err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "error getting orders because " + message }),
    };
    // } finally {
    //   client.destroy();
    //   ddbClient.destroy();
  }
};

export const updateItem: Handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log("event", JSON.stringify(event, null, 2));
  console.log("context", JSON.stringify(context, null, 2));
  try {
    const validatedRequest = validateAndGetOrderRequestObject(event);
    if ("statusCode" in validatedRequest) return validatedRequest;

    const output = await ddbClient.get({
      TableName: tableName,
      Key: {
        id: validatedRequest.id,
      },
    });
    console.log("getItem", output);
    if (!output.Item) {
      return {
        statusCode: 404,
        body: "incorrect orderId",
      };
    }

    const response = await ddbClient.put({ TableName: tableName, Item: { ...output.Item, ...validatedRequest } });
    console.log("updateItem", response);

    return {
      statusCode: 200,
      body: JSON.stringify({ ...output.Item, ...validatedRequest }),
    };
  } catch (err) {
    console.error("error getting list of order", err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "error getting orders because " + message }),
    };
  }
};

export const deleteItem: Handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log("event", JSON.stringify(event, null, 2));
  console.log("context", JSON.stringify(context, null, 2));
  try {
    if (!event.pathParameters?.orderId) {
      return {
        statusCode: 404,
        body: "incorrect orderId",
      };
    }
    const orderId = event.pathParameters.orderId;

    const output = await ddbClient.get({
      TableName: tableName,
      Key: { id: orderId },
    });
    console.log("getItem", output);
    if (!output.Item) {
      return {
        statusCode: 404,
        body: "incorrect orderId",
      };
    }
    const response = await ddbClient.delete({
      TableName: tableName,
      Key: { id: orderId },
    });
    console.log("deleteItem", response);

    return {
      statusCode: 200,
      body: JSON.stringify(output.Item),
    };
  } catch (err) {
    console.error("error getting list of order", err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "error getting orders because " + message }),
    };
  }
};

export const getItem: Handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log("event", JSON.stringify(event, null, 2));
  console.log("context", JSON.stringify(context, null, 2));
  try {
    if (!event.pathParameters?.orderId) {
      return {
        statusCode: 404,
        body: "incorrect orderId",
      };
    }
    const orderId = event.pathParameters.orderId;
    const output = await ddbClient.get({
      TableName: tableName,
      Key: { id: orderId },
    });
    console.log("getItem", output);
    if (!output.Item) {
      return {
        statusCode: 404,
        body: "incorrect orderId",
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify(output.Item),
    };
  } catch (err) {
    console.error("error getting list of order", err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "error getting orders because " + message }),
    };
  }
};

export const getList: Handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log("event", JSON.stringify(event, null, 2));
  console.log("context", JSON.stringify(context, null, 2));
  try {
    const pageNo = event.queryStringParameters?.page || 1;
    const size = event.queryStringParameters?.size || 100;

    console.log("pageNo", pageNo, "size", size);
    let lastEvaluatedKey = undefined;
    let ids: Record<string, any>[] = [];
    // the performance can be improved by having less calls and increased limit combining pageNo*size.
    for (let i = 0; i < Number(pageNo); i++) {
      const output: ScanCommandOutput = await ddbClient.scan({
        TableName: tableName,
        ProjectionExpression: "id",
        Limit: Number(size),
        ExclusiveStartKey: lastEvaluatedKey,
      });
      console.log("batch get", output);
      lastEvaluatedKey = output.LastEvaluatedKey;
      if (!lastEvaluatedKey) {
        if (i !== Number(pageNo) - 1) ids = [];
        break;
      }
      ids = output.Items?.map(({ id }) => ({ id: id })) || [];
    }

    const input: any = { RequestItems: {} };
    let items: any = [];
    while (ids.length > 0) {
      input.RequestItems[tableName || "dummy"] = { Keys: ids };
      const response = await ddbClient.batchGet(input);
      items = [...items, response.Responses];
      const keys = response.UnprocessedKeys?.Keys;
      if (Array.isArray(keys)) ids = keys;
      else ids = [];
    }
    return {
      statusCode: 200,
      body: JSON.stringify(items),
    };
  } catch (err) {
    console.error("error getting list of order", err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "error getting orders because " + message }),
    };
  }
};

const validateAndGetOrderRequestObject = (event: APIGatewayProxyEvent): APIGatewayProxyResult | OrderItemType => {
  if (!event.body) {
    return {
      statusCode: 400,
      body: "empty request",
    };
  }
  const req: OrderItemType = JSON.parse(event.body);
  if (event.pathParameters?.orderId && event.pathParameters.orderId !== req.id) {
    return {
      statusCode: 400,
      body: "incorrect orderId",
    };
  }

  updateAuditData(req);
  return req;
};

const updateAuditData = (request: OrderItemType) => {
  const nameId: string = process.env.nameId!;
  if (!request.createdOn) request.createdOn = new Date();
  if (!request.createdBy) request.createdBy = nameId;
  request.updatedOn = new Date();
  request.updatedBy = nameId;
};
