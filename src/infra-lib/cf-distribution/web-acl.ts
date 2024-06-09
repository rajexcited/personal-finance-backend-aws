import { Construct } from "constructs";
import { AwsResourceType, ConstructProps, EnvironmentName, buildResourceName } from "../common";
import * as waf from "aws-cdk-lib/aws-wafv2";

export interface MyWebAclConstructProps extends ConstructProps {}

export class MyWebAclConstructConstruct extends Construct {
  public readonly id: string;
  public readonly arn: string;

  constructor(scope: Construct, id: string, props: MyWebAclConstructProps) {
    super(scope, id);

    const ipReputationrule: waf.CfnWebACL.RuleProperty = {
      name: "AWS-AWSManagedRulesAmazonIpReputationList",
      priority: 0,
      statement: {
        managedRuleGroupStatement: {
          vendorName: "AWS",
          name: "AWSManagedRulesAmazonIpReputationList",
        },
      },
      overrideAction: {
        none: {},
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: buildResourceName(["ipReputationListRule", "webacl"], AwsResourceType.Metric, props),
      },
    };

    const commonRule: waf.CfnWebACL.RuleProperty = {
      name: "AWS-AWSManagedRulesCommonRuleSet",
      priority: 1,
      statement: {
        managedRuleGroupStatement: {
          vendorName: "AWS",
          name: "AWSManagedRulesCommonRuleSet",
        },
      },
      overrideAction: {
        none: {},
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: buildResourceName(["commonRuleSet", "webacl"], AwsResourceType.Metric, props),
      },
    };

    const knownBadRule: waf.CfnWebACL.RuleProperty = {
      name: "AWS-AWSManagedRulesKnownBadInputsRuleSet",
      priority: 2,
      statement: {
        managedRuleGroupStatement: {
          vendorName: "AWS",
          name: "AWSManagedRulesKnownBadInputsRuleSet",
        },
      },
      overrideAction: {
        none: {},
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: buildResourceName(["knownBadInputsRuleSet", "webacl"], AwsResourceType.Metric, props),
      },
    };

    const botControlRule: waf.CfnWebACL.RuleProperty = {
      name: "AWS-AWSBotControl",
      priority: 5,
      statement: {
        managedRuleGroupStatement: {
          vendorName: "AWS",
          name: "AWSManagedRulesBotControlRuleSet",
          managedRuleGroupConfigs: [
            {
              awsManagedRulesBotControlRuleSet: {
                inspectionLevel: "COMMON",
              },
            },
          ],
          ruleActionOverrides: [
            {
              name: "AWS-AWSBotControl-Challenge",
              actionToUse: { challenge: {} },
            },
          ],
          excludedRules: [],
        },
      },

      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: "AWS-AWSBotControl",
      },
    };

    const webacl = new waf.CfnWebACL(this, "DistributionWebAclConstruct", {
      defaultAction: { allow: {} },
      scope: "CLOUDFRONT",
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: buildResourceName(["cloudfront", "webacl"], AwsResourceType.Metric, props),
      },
      rules: [ipReputationrule, commonRule, knownBadRule],
    });

    this.id = webacl.attrId;
    this.arn = webacl.attrArn;
  }
}
