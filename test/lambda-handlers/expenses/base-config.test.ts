import { getGsiSkDetailsExpenseDate } from "../../../src/lambda-handlers/expenses/db-config";
import { getLogger } from "../../../src/lambda-handlers/utils";
import { ConsoleMock, spyConsole } from "../../mock";
import * as datetime from "date-and-time";

describe("base config", () => {
  let mockConsole: ConsoleMock;

  beforeEach(() => {
    mockConsole = spyConsole();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("date instance converted to sk", () => {
    const logger = getLogger("dummy");
    const expenseDate = datetime.parse("2024-04-26", "YYYY-MM-DD");

    // const sk = getGsiSkDetailsExpenseDate(expenseDate, logger);
    // expect(sk).toBe("expenseDate#2024-04-26");
  });
});
