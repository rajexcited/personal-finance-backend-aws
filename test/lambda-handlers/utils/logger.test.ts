import { LoggerBase, getLogger } from "../../../src/lambda-handlers/utils/logger";
import { ConsoleMock, spyConsole } from "../../mock";

describe("logger level without any parent", () => {
  let mockConsole: ConsoleMock;

  const expectToHaveBeenCalled = (mock: jest.SpyInstance, loggerId: string) => {
    expect(mock).toHaveBeenCalled();
    expect(mock).toHaveBeenCalledWith(loggerId, "a", JSON.stringify(["b"]), JSON.stringify({ c: "c" }));
  };

  beforeEach(() => {
    mockConsole = spyConsole();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("console printing debug level", () => {
    const logger = getLogger("debugTest");
    logger.setLogLevel("DEBUG");

    logger.debug("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.debug, "debugTest");
    logger.log("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.log, "debugTest");
    logger.info("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.info, "debugTest");
    logger.warn("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.warn, "debugTest");
    logger.error("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.error, "debugTest");
  });

  test("console printing info level", () => {
    const logger = getLogger("infoTest", null, null, "INFO");

    logger.debug("a", ["b"], { c: "c" });
    expect(mockConsole.debug).not.toHaveBeenCalled();
    logger.log("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.log, "infoTest");
    logger.info("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.info, "infoTest");
    logger.warn("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.warn, "infoTest");
    logger.error("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.error, "infoTest");
  });

  test("console printing error level", () => {
    const logger = getLogger("errorTest", null, null, "ERROR");

    logger.debug("a", ["b"], { c: "c" });
    expect(mockConsole.debug).not.toHaveBeenCalled();
    logger.log("a", ["b"], { c: "c" });
    expect(mockConsole.log).not.toHaveBeenCalled();
    logger.info("a", ["b"], { c: "c" });
    expect(mockConsole.info).not.toHaveBeenCalled();
    logger.warn("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.warn, "errorTest");
    logger.error("a", ["b"], { c: "c" });
    expectToHaveBeenCalled(mockConsole.error, "errorTest");
  });
});

describe("logger level with parent1", () => {
  let mockConsole: ConsoleMock;

  const expectToHaveBeenCalled = (mock: jest.SpyInstance, loggerId: string) => {
    expect(mock).toHaveBeenCalled();
    expect(mock).toHaveBeenCalledWith(loggerId, "a", JSON.stringify(["b"]), JSON.stringify({ c: "c" }));
  };

  describe("parent1 loglevel is debug", () => {
    let parent1: LoggerBase;
    beforeAll(() => {
      parent1 = getLogger("parent1");
      parent1.setLogLevel("DEBUG");
    });

    describe("and child is info", () => {
      beforeEach(() => {
        mockConsole = spyConsole();
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      test("console printing info level", () => {
        const logger = getLogger("childinfo", parent1, null, "INFO");

        const childLoggerId = parent1.id + ".childinfo";

        logger.debug("a", ["b"], { c: "c" });
        expect(mockConsole.debug).not.toHaveBeenCalled();
        logger.log("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.log, childLoggerId);
        logger.info("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.info, childLoggerId);
        logger.warn("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.warn, childLoggerId);
        logger.error("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.error, childLoggerId);
      });
    });

    describe("and child is without any", () => {
      beforeEach(() => {
        mockConsole = spyConsole();
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      test("console printing should be debug level because of parent1", () => {
        const logger = getLogger("childinfo", parent1, null);

        const childLoggerId = parent1.id + ".childinfo";

        logger.debug("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.debug, childLoggerId);
        logger.log("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.log, childLoggerId);
        logger.info("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.info, childLoggerId);
        logger.warn("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.warn, childLoggerId);
        logger.error("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.error, childLoggerId);
      });
    });
  });

  describe("parent2 loglevel is debug", () => {
    let parent2: LoggerBase;
    beforeAll(() => {
      parent2 = getLogger("parent2", null, null, "DEBUG");
    });

    describe("and child is info", () => {
      beforeEach(() => {
        mockConsole = spyConsole();
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      test("console printing info level", () => {
        const logger = getLogger("childinfo", null, parent2, "INFO");

        const childLoggerId = parent2.id + ".childinfo";

        logger.debug("a", ["b"], { c: "c" });
        expect(mockConsole.debug).not.toHaveBeenCalled();
        logger.log("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.log, childLoggerId);
        logger.info("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.info, childLoggerId);
        logger.warn("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.warn, childLoggerId);
        logger.error("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.error, childLoggerId);
      });
    });

    describe("and child is without any", () => {
      beforeEach(() => {
        mockConsole = spyConsole();
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      test("console printing should be debug level because of parent1", () => {
        const logger = getLogger("childinfo", null, parent2);

        const childLoggerId = parent2.id + ".childinfo";

        logger.debug("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.debug, childLoggerId);
        logger.log("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.log, childLoggerId);
        logger.info("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.info, childLoggerId);
        logger.warn("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.warn, childLoggerId);
        logger.error("a", ["b"], { c: "c" });
        expectToHaveBeenCalled(mockConsole.error, childLoggerId);
      });
    });
  });
});

describe("logger level with parent1 and parent2", () => {
  let mockConsole: ConsoleMock;

  const expectToHaveBeenCalled = (mock: jest.SpyInstance, loggerId: string) => {
    expect(mock).toHaveBeenCalled();
    expect(mock).toHaveBeenCalledWith(loggerId, "a", JSON.stringify(["b"]), JSON.stringify({ c: "c" }));
  };

  describe("parent1 loglevel is not set", () => {
    let parent1: LoggerBase;

    beforeAll(() => {
      parent1 = getLogger("parent1");
      parent1.setLogLevel("DEBUG");
    });

    describe("parent2 loglevel is debug", () => {
      let parent2: LoggerBase;
      beforeAll(() => {
        parent2 = getLogger("parent2", null, null);
      });

      describe("and child loglevel is info", () => {
        beforeEach(() => {
          mockConsole = spyConsole();
        });

        afterEach(() => {
          jest.clearAllMocks();
        });

        test("console printing info level", () => {
          const logger = getLogger("childinfo", parent1, parent2, "INFO");

          const childLoggerId = parent2.id + "." + parent1.id + ".childinfo";

          logger.debug("a", ["b"], { c: "c" });
          expect(mockConsole.debug).not.toHaveBeenCalled();
          logger.log("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.log, childLoggerId);
          logger.info("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.info, childLoggerId);
          logger.warn("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.warn, childLoggerId);
          logger.error("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.error, childLoggerId);
        });
      });

      describe("and child is without any", () => {
        beforeEach(() => {
          mockConsole = spyConsole();
        });

        afterEach(() => {
          jest.clearAllMocks();
        });

        test("console printing should be debug level because of parent2", () => {
          const logger = getLogger("childinfo", parent1, parent2);

          const childLoggerId = parent2.id + "." + parent1.id + ".childinfo";

          logger.debug("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.debug, childLoggerId);
          logger.log("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.log, childLoggerId);
          logger.info("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.info, childLoggerId);
          logger.warn("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.warn, childLoggerId);
          logger.error("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.error, childLoggerId);
        });
      });
    });
  });
});

describe("nested parents", () => {
  let mockConsole: ConsoleMock;

  const expectToHaveBeenCalled = (mock: jest.SpyInstance, loggerId: string) => {
    expect(mock).toHaveBeenCalled();
    expect(mock).toHaveBeenCalledWith(loggerId, "a", JSON.stringify(["b"]), JSON.stringify({ c: "c" }));
  };

  describe("parent1", () => {
    let parent1: LoggerBase;

    beforeAll(() => {
      parent1 = getLogger("parent1");
    });

    describe("parent1.1 inside parent1", () => {
      let parent11: LoggerBase;
      beforeAll(() => {
        parent11 = getLogger("parent11", parent1, null);
      });

      describe("and child inside of parent1.1", () => {
        beforeEach(() => {
          mockConsole = spyConsole();
        });

        afterEach(() => {
          jest.clearAllMocks();
        });

        test("console printing info level", () => {
          const logger = getLogger("childinfo", parent11, null, "INFO");

          const childLoggerId = "parent1.parent11.childinfo";

          logger.debug("a", ["b"], { c: "c" });
          expect(mockConsole.debug).not.toHaveBeenCalled();
          logger.log("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.log, childLoggerId);
          logger.info("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.info, childLoggerId);
          logger.warn("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.warn, childLoggerId);
          logger.error("a", ["b"], { c: "c" });
          expectToHaveBeenCalled(mockConsole.error, childLoggerId);
        });
      });

      describe("parent2 of different", () => {
        let parent2: LoggerBase;

        beforeAll(() => {
          parent2 = getLogger("parent2");
        });

        describe("parent2.2 inside parent 2", () => {
          let parent22: LoggerBase;
          beforeAll(() => {
            parent22 = getLogger("parent22", parent2, null);
          });

          describe("and child inside of parent1.1 and parent 2.2", () => {
            beforeEach(() => {
              mockConsole = spyConsole();
            });

            afterEach(() => {
              jest.clearAllMocks();
            });

            test("console printing info level", () => {
              const logger = getLogger("childinfo", parent11, parent22, "INFO");
              const childLoggerId = "parent2.parent22.parent1.parent11.childinfo";

              logger.debug("a", ["b"], { c: "c" });
              expect(mockConsole.debug).not.toHaveBeenCalled();
              logger.log("a", ["b"], { c: "c" });
              expectToHaveBeenCalled(mockConsole.log, childLoggerId);
              logger.info("a", ["b"], { c: "c" });
              expectToHaveBeenCalled(mockConsole.info, childLoggerId);
              logger.warn("a", ["b"], { c: "c" });
              expectToHaveBeenCalled(mockConsole.warn, childLoggerId);
              logger.error("a", ["b"], { c: "c" });
              expectToHaveBeenCalled(mockConsole.error, childLoggerId);
            });
          });
        });
      });
    });
  });
});
