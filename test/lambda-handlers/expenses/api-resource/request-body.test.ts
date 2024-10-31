import { getValidatedRequestToUpdateExpenseDetails } from "../../../../src/lambda-handlers/expenses/api-resource/request-body";
import { JSONObject, JSONValue, MethodType, ValidationError } from "../../../../src/lambda-handlers/apigateway";
import { ApiResourceExpense, ErrorMessage } from "../../../../src/lambda-handlers/expenses/api-resource";
import { ExpenseBelongsTo, ExpenseStatus } from "../../../../src/lambda-handlers/expenses/base-config";
import { getLogger } from "../../../../src/lambda-handlers/utils";
import { getMockApiGatewayProxyEvent } from "../../../mock";

describe("base expense request body provided, validate", () => {
  const validExpenseBase: ApiResourceExpense = {
    id: "b89241ee-7ff2-48ea-bd30-d322fdcde6d1",
    billName: "test store",
    description: "description",
    tags: [],
    personIds: [],
    receipts: [],
    auditDetails: {
      createdOn: "2024-10-23T04:47:27.569Z",
      updatedOn: "2024-10-23T04:47:27.569Z",
    },
    belongsTo: ExpenseBelongsTo.Purchase,
    profileId: "currency-profile",
    status: ExpenseStatus.ENABLE,
  };

  const testValidationError = async (fieldName: keyof ApiResourceExpense, fieldValue: JSONValue, errorMessage: string) => {
    const req = { ...validExpenseBase } as any;
    req[fieldName] = fieldValue;
    const mockEvent = getMockApiGatewayProxyEvent({
      method: MethodType.POST,
      body: req as JSONObject,
      pathParameters: {},
    });
    const logger = getLogger("test." + fieldName, null, null, "ERROR");
    try {
      const apiResult = await getValidatedRequestToUpdateExpenseDetails(mockEvent, logger);
      expect(apiResult).not.toBeDefined();
      expect(apiResult).toBeDefined();
    } catch (e) {
      if (e instanceof ValidationError) {
        const err = e as ValidationError;
        expect(err.message).not.toBe("");
        expect(err.getInvalidFields().length).toEqual(1);
        err.getInvalidFields().forEach((invalidField) => {
          expect(invalidField.path).toBe(fieldName);
          expect(invalidField.message).toBe(errorMessage);
        });
      } else {
        throw e;
      }
    }
  };

  test("billname, gives error because empty", testValidationError.bind(null, "billName", "", ErrorMessage.MISSING_VALUE));
  test("id, gives error because empty", testValidationError.bind(null, "id", "", ErrorMessage.MISSING_VALUE));
  test("description, gives error because null", testValidationError.bind(null, "description", null, ErrorMessage.MISSING_VALUE));
  test("status, gives error because disable", testValidationError.bind(null, "status", "disable", ErrorMessage.INCORRECT_VALUE));

  test(
    "receipts, gives error because expenseId mismatched",
    testValidationError.bind(
      null,
      "receipts",
      [
        {
          name: "abc.png",
          contentType: "image/png",
          id: "1d778b90-a1a3-483b-aa55-968916141330",
          relationId: "48b3786d-0553-4222-b0bb-f8ac025fdf67",
          belongsTo: "purchase",
        },
      ],
      ErrorMessage.INCORRECT_VALUE
    )
  );
});
