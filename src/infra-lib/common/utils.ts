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
  const propsArray = props ? [props.resourcePrefix, props.environment] : [];
  const name = [...propsArray, ...nameParts, awsResourceType].join(sep);
  if (awsResourceType === AwsResourceType.CftOutput) {
    return camelCase(name);
  }
  return name;
};
