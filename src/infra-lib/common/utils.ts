import { Duration } from "aws-cdk-lib";
import { camelCase } from "./camelcase";
import { AwsResourceType, ConstructProps } from "./props-type";

/**
 * resourceNames are mostly consists of dash. for few which doesn't support dash, we convert it to camelCase
 *
 * @param nameParts for build resource name
 * @param awsResourceType resource name to add as suffix.
 * @param props constructor props containing environment and resource prefix details
 */
export const buildResourceName = (nameParts: string[], awsResourceType: AwsResourceType, props?: ConstructProps) => {
  if (nameParts.length === 0) {
    throw new Error("name parts are not provided. hence resource name can not be built.");
  }
  const sep = "-";
  const propsArray = props ? [props.appId, props.environment] : [];
  const name = [...propsArray, ...nameParts, awsResourceType].join(sep);
  if (awsResourceType === AwsResourceType.CftOutput || awsResourceType === AwsResourceType.BucketDeployment) {
    return camelCase([...nameParts, "fn" + propsArray.join(""), awsResourceType].join(sep));
  }
  return name;
};

type Nullable<T> = NonNullable<T> | null;

export const parsedDuration = (formatted: string) => {
  const trimmed = formatted.trim();
  const parts = [0, 0, 0, 0, 0];
  let num: Nullable<string> = null;

  trimmed.split(" ").forEach((st) => {
    if (st) {
      const match =
        /^(-?(?:\d+)?\.?\d+)* *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mnths?|years?|yrs?|y)?$/i.exec(st);
      let tm: Nullable<string> = null;
      if (match) {
        tm = match[2] ? match[2].trim() : null;
        num = num !== null ? num : match[1] ? match[1].trim() : null;
      }

      if (!isNaN(Number(num))) {
        switch (tm?.toLowerCase()) {
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
            num = null;
            break;
          case "second":
          case "seconds":
          case "secs":
          case "sec":
          case "s":
            parts[3] += Number(num);
            num = null;
            break;
          case "minute":
          case "minutes":
          case "mins":
          case "min":
          case "m":
            parts[2] = Number(num);
            num = null;
            break;
          case "hours":
          case "hour":
          case "hrs":
          case "hr":
          case "h":
            parts[1] = Number(num);
            num = null;
            break;
          case "days":
          case "day":
          case "d":
            parts[0] += Number(num);
            num = null;
            break;
          case "weeks":
          case "week":
          case "w":
            parts[0] += 7 * Number(num);
            num = null;
            break;
          case "months":
          case "month":
          case "mnths":
          case "mnth":
            parts[0] += 30.42 * Number(num);
            num = null;
            break;
          case "years":
          case "year":
          case "yrs":
          case "y":
            parts[0] += 365.25 * Number(num);
            num = null;
            break;
        }
      }
    }
  });

  const durationFormat = ["DT", "H", "M", ".", "S"].reduce((formatted, unit, ind) => {
    const partnum = Math.ceil(parts[ind]);
    return formatted + partnum + unit;
  }, "P");

  // return Duration.parse(`P${parts[0]}DT${parts[1]}H${parts[2]}M${parts[3]}.${parts[4]}S`);
  return Duration.parse(durationFormat);
};
