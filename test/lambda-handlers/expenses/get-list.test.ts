import { ConsoleMock, spyConsole } from "../../test-utils";
import { dateutil } from "../../../src/lambda-handlers/utils";
import * as datetime from "date-and-time";

describe("get expense list", () => {
  describe("when 3 months per page is configured and now is 4/25/2024", () => {
    const now = datetime.parse("04-25-2024", "MM-DD-YYYY");
    const monthsPerPage = 3;

    describe("querying page no 1", () => {
      let mockConsole: ConsoleMock;
      const pageNo = 1;

      beforeEach(() => {
        mockConsole = spyConsole();
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      test("start date before months should be 02-01-2024", () => {
        const startDate = getStartDateBeforeMonths(now, -1 * pageNo * monthsPerPage);
        expect(startDate).not.toBe(new Date(NaN));
        expect(datetime.format(startDate, "MM-DD-YYYY")).toBe("02-01-2024");
      });

      test("end date after months should be 04-30-2024", () => {
        const endDate = getEndDateAfterMonths(now, (1 - pageNo) * monthsPerPage);
        expect(endDate).not.toBe(new Date(NaN));
        expect(datetime.format(endDate, "MM-DD-YYYY")).toBe("04-30-2024");
      });
    });

    describe("querying page no 2", () => {
      let mockConsole: ConsoleMock;
      const pageNo = 2;

      beforeEach(() => {
        mockConsole = spyConsole();
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      test("start date before months should be 11-01-2023", () => {
        const startDate = getStartDateBeforeMonths(now, -1 * pageNo * monthsPerPage);
        expect(startDate).not.toBe(new Date(NaN));
        expect(datetime.format(startDate, "MM-DD-YYYY")).toBe("11-01-2023");
      });

      test("end date after months should be 01-31-2024", () => {
        const startDate = getEndDateAfterMonths(now, (1 - pageNo) * monthsPerPage);
        expect(startDate).not.toBe(new Date(NaN));
        expect(datetime.format(startDate, "MM-DD-YYYY")).toBe("01-31-2024");
      });
    });

    describe("querying page no 3", () => {
      let mockConsole: ConsoleMock;
      const pageNo = 3;

      beforeEach(() => {
        mockConsole = spyConsole();
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      test("start date before months should be 08-01-2023", () => {
        const startDate = getStartDateBeforeMonths(now, -1 * pageNo * monthsPerPage);
        expect(startDate).not.toBe(new Date(NaN));
        expect(datetime.format(startDate, "MM-DD-YYYY")).toBe("08-01-2023");
      });

      test("end date after months should be 10-31-2023", () => {
        const startDate = getEndDateAfterMonths(now, (1 - pageNo) * monthsPerPage);
        expect(startDate).not.toBe(new Date(NaN));
        expect(datetime.format(startDate, "MM-DD-YYYY")).toBe("10-31-2023");
      });
    });
  });
});

const getStartDateBeforeMonths = (date: Date, months: number) => {
  const startDate = dateutil.getMonthStartDate(date);
  const newDate = datetime.addMonths(startDate as Date, months + 1);
  return newDate;
};

const getEndDateAfterMonths = (date: Date, months: number) => {
  const newDate = datetime.addMonths(date, months);
  const endDate = dateutil.getMonthEndDate(newDate);
  return endDate as Date;
};
