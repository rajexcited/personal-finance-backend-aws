import { userSignup } from "../../../src/lambda-handlers";
import { getMockApiGatewayProxyEvent, getMockContext, spyConsole } from "../../mock";
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
    const mockEvent = getMockApiGatewayProxyEvent({
      method: MethodType.POST,
      body: req,
    });

    const context = getMockContext();
    console.log("context =", context);
    await userSignup(mockEvent, context);
  });
});
