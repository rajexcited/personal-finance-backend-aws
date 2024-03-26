/*
 * if required to use log4j like syntax, can use one of the following modules
 * https://www.npmjs.com/package/log4js
 *
 * https://www.npmjs.com/package/debug
 *
 * https://www.npmjs.com/package/winston
 */

/**
 * log level to set
 */
enum LogLevel {
  DEBUG = 1,
  INFO = 2,
  ERROR = 3,
}

type LogLevelType = "info" | "debug" | "error" | "INFO" | "DEBUG" | "ERROR";
let defaultLogLevel: LogLevelType = "INFO";

export const setDefaultLogLevel = (logLevel: LogLevelType) => {
  defaultLogLevel = logLevel;
};

/**
 *
 * @param id
 * @param logLevel override default loglevel. if baseLogger is provided, default log level will be referenced from baseLogger
 * @param baseLogger
 * @returns
 */
export const getLogger = (id: string, baseLogger?: LoggerBase, logLevel?: LogLevelType) => {
  return new LoggerBase(id, logLevel, baseLogger);
};

export class LoggerBase {
  public readonly id: string;
  private logLevel: LogLevel;

  constructor(id: string, logLevel?: LogLevelType, baseLogger?: LoggerBase) {
    if (baseLogger) {
      this.id = baseLogger.id + "." + id;
    } else {
      this.id = id;
    }

    const level = logLevel || baseLogger?.getLogLevelType() || defaultLogLevel;
    this.setLogLevel(level as LogLevelType);
  }

  public getLogLevelType() {
    let level: LogLevelType;
    switch (this.logLevel) {
      case LogLevel.DEBUG:
        level = "DEBUG";
        break;
      case LogLevel.ERROR:
        level = "ERROR";
        break;
      case LogLevel.INFO:
      default:
        level = "INFO";
    }
    return level;
  }

  public setLogLevel(level: LogLevelType) {
    switch (level.toLowerCase()) {
      case "debug":
        this.logLevel = LogLevel.DEBUG;
        break;
      case "info":
        this.logLevel = LogLevel.INFO;
        break;
      case "error":
        this.logLevel = LogLevel.ERROR;
        break;
      default:
    }
  }

  public debug(...args: any[]) {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.printToConsole("debug", args);
    }
  }

  public info(...args: any[]) {
    if (this.logLevel <= LogLevel.INFO) {
      this.printToConsole("info", args);
    }
  }

  public log(...args: any[]) {
    if (this.logLevel <= LogLevel.INFO) {
      this.printToConsole("log", args);
    }
  }

  public warn(...args: any[]) {
    if (this.logLevel <= LogLevel.ERROR) {
      this.printToConsole("warn", args);
    }
  }

  public warning(...args: any[]) {
    if (this.logLevel <= LogLevel.ERROR) {
      this.printToConsole("warn", args);
    }
  }

  public error(...args: any[]) {
    if (this.logLevel <= LogLevel.ERROR) {
      this.printToConsole("error", args);
    }
  }

  private printToConsole(ctype: ConsoleLogType, ...args: any[]) {
    consoleprint(ctype, this.id, ...args);
  }
}

type ConsoleLogType = "debug" | "log" | "error" | "warn" | "info";
const consoleprint = (ctype: ConsoleLogType, ...args: any[]) => {
  const argscopy = args.flatMap((a) => {
    if (a instanceof Error) {
      console.log([JSON.stringify({ errorMessage: a.message, errorClassName: a.name }), a.stack]);
      console.warn(a);
      console.error(a);
      return [JSON.stringify({ errorMessage: a.message, errorClassName: a.name }), a.stack];
    }
    if (typeof a === "object") return JSON.stringify(a, null, 2);
    return a;
  });

  console[ctype](...argscopy);
};
