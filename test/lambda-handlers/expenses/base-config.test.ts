import { getUserIdStatusDateGsiSk } from "../../../src/lambda-handlers/expenses/base-config";
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
    const updatedOn = datetime.parse("2024-04-26", "YYYY-MM-DD");

    const sk = getUserIdStatusDateGsiSk(updatedOn, logger);
    expect(sk).toBe("updatedOn#2024-04-26");
  });
});
