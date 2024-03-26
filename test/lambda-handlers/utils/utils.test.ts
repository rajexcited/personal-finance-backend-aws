import { v4 as uuidv4 } from "uuid";
import { utils } from "../../../src/lambda-handlers/utils";
import { DbUserDetails } from "../../../src/lambda-handlers/user";

test("test updateAuditDetails", () => {
  const dbDetails: DbUserDetails = {
    id: uuidv4(),
    emailId: "emailId",
    firstName: "firstName",
    lastName: "lastName",
    phash: "password",
    auditDetails: { createdBy: "", createdOn: "", updatedBy: "", updatedOn: "" },
  };
  const expectedAuditDetails = utils.updateAuditDetails(dbDetails.auditDetails, dbDetails);
  expect(expectedAuditDetails).not.toBeNull();
  expect(expectedAuditDetails?.createdBy).toEqual(dbDetails.id);
  expect(expectedAuditDetails?.updatedBy).toEqual(dbDetails.id);

  expect(expectedAuditDetails?.updatedOn).not.toHaveLength(0);
  console.log(expectedAuditDetails?.createdOn, expectedAuditDetails?.createdOn.toString().length);
  expect(expectedAuditDetails?.createdOn).not.toHaveLength(0);
});
