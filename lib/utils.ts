import { Duration } from "aws-cdk-lib";
import { camelCase } from "./camelcase";
import { AwsResourceType, ConstructProps } from "./props-type";

/**
 *
 * @param props constructor props containing environment and resource prefix details
 * @param nameParts for build resource name
 * @param seperator to concatenate all parts with seperator. if ommitted DASH (-) is used as default except for CftOutput .
 */
export const buildResourceName = (nameParts: string[], awsResourceType: AwsResourceType, props?: ConstructProps | null, seperator?: string) => {
  if (nameParts.length === 0) {
    throw new Error("name parts are not provided. hence resource name can not be built.");
  }
  const sep = seperator || "-";
  const propsArray = props ? [props.appId, props.infraEnv] : [];
  const name = [...propsArray, ...nameParts, awsResourceType].join(sep);
  if (awsResourceType === AwsResourceType.CftOutput) {
    return camelCase(name);
  }
  return name;
};

export const parsedDuration = (formatted: string) => {
  const trimmed = formatted.trim();
  const parts = [0, 0, 0, 0, 0];
  trimmed.split(" ").forEach((st) => {
    if (st) {
      const match =
        /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(st);
      if (match) {
        const num = match[1].trim();
        if (!isNaN(Number(num))) {
          const tm = match[2].trim();
          switch (tm) {
            case "milliseconds":
            case "millisecond":
            case "msecs":
            case "msec":
            case "ms":
              const ms = Number(num);
              if (ms > 999) {
                parts[4] = ms % 999;
                parts[3] += Math.floor(ms / 999);
              } else {
                parts[4] = Number(num);
              }
              break;
            case "second":
            case "seconds":
            case "secs":
            case "sec":
            case "s":
              parts[3] += Number(num);
              break;
            case "minute":
            case "minutes":
            case "mins":
            case "min":
            case "m":
              parts[2] = Number(num);
              break;
            case "hours":
            case "hour":
            case "hrs":
            case "hr":
            case "h":
              parts[1] = Number(num);
              break;
            case "days":
            case "day":
            case "d":
              parts[0] += Number(num);
              break;
            case "weeks":
            case "week":
            case "w":
              parts[0] += 7 * Number(num);
              break;
            case "years":
            case "year":
            case "yrs":
            case "y":
              parts[0] += 365.25 * Number(num);
              break;
          }
        }
      }
    }
  });

  return Duration.parse(`P${parts[0]}DT${parts[1]}H${parts[2]}M${parts[3]}.${parts[4]}S`);
};
