import { userSignup } from "../../../src/lambda-handlers";
import { getMockApiGatewayProxyEvent, mockContext, spyConsole } from "../../mock";
import { MethodType } from "../../../src/lambda-handlers/apigateway";

describe("signup", () => {
  beforeAll(() => {
    spyConsole();
  });
  afterAll(() => {
    jest.clearAllMocks();
  });

  test("signup handler", async () => {
    const req = {
      emailId: "email2@domain.org",
      password: "p@s5Word",
      firstName: "2 first name",
      lastName: "2 last name",
    };
    const mockEvent = getMockApiGatewayProxyEvent(MethodType.POST, req);
    await userSignup(mockEvent, mockContext);
  });
});
