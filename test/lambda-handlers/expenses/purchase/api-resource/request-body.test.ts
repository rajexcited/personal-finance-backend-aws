import { InvalidField } from "../../../../../src/lambda-handlers/apigateway";
import { ErrorMessage } from "../../../../../src/lambda-handlers/expenses/api-resource";
import { ApiResourcePurchaseItemDetails } from "../../../../../src/lambda-handlers/expenses/purchase/api-resource";
import { validateItems } from "../../../../../src/lambda-handlers/expenses/purchase/api-resource/request-body";
import { getLogger } from "../../../../../src/lambda-handlers/utils";

describe("purchase details request body provided, validate", () => {
  const validPurchaseItem: ApiResourcePurchaseItemDetails = {
    id: "b89241ee-7ff2-48ea-bd30-d322fdcde6d1",
    billName: "cutlery",
    description: "description",
    tags: ["t1", "tst2"],
    amount: "1.2",
    purchaseTypeId: "1d778b90-a1a3-483b-aa55-968916141330",
  };

  test("purchase items, gives error because only itemname populated", async () => {
    const invalidPurchaseItem: ApiResourcePurchaseItemDetails = {
      billName: validPurchaseItem.billName,
      amount: "",
      description: "",
      id: "",
      tags: [],
    };

    const logger = getLogger("test.billname", null, null, "ERROR");

    const invalidFields: InvalidField[] = [];
    validateItems([invalidPurchaseItem], invalidFields, logger);

    expect(invalidFields.length).toEqual(1);
    expect(invalidFields[0].path).toBe("items");
    expect(invalidFields[0].message).toBe(ErrorMessage.INCORRECT_VALUE);
  });

  test("purchase items, gives error because amount not populated", async () => {
    const invalidPurchaseItem: ApiResourcePurchaseItemDetails = {
      billName: validPurchaseItem.billName,
      amount: "",
      description: "",
      id: validPurchaseItem.id,
      tags: [],
    };

    const logger = getLogger("test.billname", null, null, "ERROR");

    const invalidFields: InvalidField[] = [];
    validateItems([invalidPurchaseItem], invalidFields, logger);

    expect(invalidFields.length).toEqual(1);
    expect(invalidFields[0].path).toBe("items");
    expect(invalidFields[0].message).toBe(ErrorMessage.INCORRECT_VALUE);
  });

  test("purchase items, gives no error because all details are valid", async () => {
    const logger = getLogger("test.billname", null, null, "ERROR");

    const invalidFields: InvalidField[] = [];
    validateItems([{ ...validPurchaseItem }], invalidFields, logger);

    expect(invalidFields.length).toEqual(0);
  });
});
