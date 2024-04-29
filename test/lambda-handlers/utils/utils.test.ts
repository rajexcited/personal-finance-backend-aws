import { v4 as uuidv4 } from "uuid";
import { utils } from "../../../src/lambda-handlers/utils";
import { spyConsole } from "../../mock";

describe("generic utils", () => {
  beforeAll(() => {
    spyConsole();
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  test("test updateAuditDetails", () => {
    spyConsole();
    const userId = uuidv4();
    const auditDetails = { createdBy: "", createdOn: "", updatedBy: "", updatedOn: "" };
    const expectedAuditDetails = utils.updateAuditDetails(auditDetails, userId);
    expect(expectedAuditDetails).not.toBeNull();
    expect(expectedAuditDetails?.createdBy).toEqual(userId);
    expect(expectedAuditDetails?.updatedBy).toEqual(userId);

    expect(expectedAuditDetails?.updatedOn).not.toHaveLength(0);
    console.log(expectedAuditDetails?.createdOn, expectedAuditDetails?.createdOn.toString().length);
    expect(expectedAuditDetails?.createdOn).not.toHaveLength(0);
  });
});
