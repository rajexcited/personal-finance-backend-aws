# personal-finance-backend-aws

This is backend api services. The backend infra setup is by environment (local, test, prod).

- The `local` environment is for development.
- The `test` environment is experimental to test through github workflow from branch `test-pipeline`.
- The `prod` environment is ready to be used as final production.

In order to use any aws services, infra stack needs to be deployed. To enable `cdk deploy`, we need to bootstrap and setup the permissions.

## Create IAM policies for CDK deployment

Before bootstrapping, make sure to have IAM policies for CDK deployment in an account. if you don't have, follow steps to [create IAM policy](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create-console.html)

- copy policy files located at `cfn-exec-role\policies\` to dist folder
- replace `${aws:PrincipalAccount}` with actual awsAccountNumber in these json files of dist folder.
- create policy with this JSON files
- policy name and corresponding file name are listed below table.

| Policy Name     | file location                                                                 |
| --------------- | ----------------------------------------------------------------------------- |
| CdkApiLambda    | [api-lambda-policy.json](cfn-exec-role\policies\api-lambda-policy.json)       |
| CdkCloudfront   | [cloudfront-policy.json](cfn-exec-role\policies\cloudfront-policy.json)       |
| CdkEventMessage | [event-message-policy.json](cfn-exec-role\policies\event-message-policy.json) |
| CdkIam          | [iam-policy.json](cfn-exec-role\policies\iam-policy.json)                     |
| CdkSecretParam  | [secret-param-policy.json](cfn-exec-role\policies\secret-param-policy.json)   |
| CdkStorage      | [storage-policy.json](cfn-exec-role\policies\storage-policy.json)             |

#### Cli command example

```cmd
aws iam create-policy --policy-name CdkApiLambda --policy-document file://cfn-exec-role\policies\api-lambda-policy.json
```

## Bootstrap for environment

we will [customise the cdk bootstrap template](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-customizing.html) to create stack for each environment.

`cdk bootstrap --tags appId=<appId> --tags environment=<envId> --toolkit-stack-name CDKToolkit-<appId-envId> --qualifier <appId><envId> --cloudformation-execution-policies <list of policy arn seperated by comma>`

bootstrap customized Command example

```cmd
# (for tst env)
cdk bootstrap --tags appId=prsfin --tags environment=tst --toolkit-stack-name CDKToolkit-prsfin-tst --qualifier prsfintst --cloudformation-execution-policies "arn:aws:iam::${AwsAccountNo}:policy/CdkApiLambda,arn:aws:iam::${AwsAccountNo}:policy/CdkCloudfront,arn:aws:iam::${AwsAccountNo}:policy/CdkEventMessage,arn:aws:iam::${AwsAccountNo}:policy/CdkIam,arn:aws:iam::${AwsAccountNo}:policy/CdkSecretParam,arn:aws:iam::${AwsAccountNo}:policy/CdkStorage"


# (for prd env)
cdk bootstrap --tags appId=prsfin --tags environment=prd --toolkit-stack-name CDKToolkit-prsfin-prd --qualifier prsfinprd --cloudformation-execution-policies "arn:aws:iam::${AwsAccountNo}:policy/CdkApiLambda,arn:aws:iam::${AwsAccountNo}:policy/CdkCloudfront,arn:aws:iam::${AwsAccountNo}:policy/CdkEventMessage,arn:aws:iam::${AwsAccountNo}:policy/CdkIam,arn:aws:iam::${AwsAccountNo}:policy/CdkSecretParam,arn:aws:iam::${AwsAccountNo}:policy/CdkStorage"
```

#### Bootstrap Param Value Rules:

**--qualifier**: there must be 9 chars according cdk bootstrap cli rules. default value is `hnb659fds`. so we are dividing into 6+3 to customize to accomodate control for app by env. the format is `<appId><envId>`

- 6 chars AppId (if less than 6, add some dummy/mock chars.)
- 3 chars Environment Id

**--tags**: app tag is required to identify which boootstrap is for what? also if further access control requires, can use tags in access conditions.

**--custom-permissions-boundary**: attach the Iam boundary policy created in previos step. this will be attached to CFT execution role so that cdk deploy will have controlled access.

**--toolkit-stack-name**: the default value is CDKToolkit. we are modifying it to ensure create stack by app and env instead of overlapping same stack. By overlapping same bootstrap stack, it can corrupt access controll and deployed resource permissions. so we are adding app and env Ids selected for qualifier param. the stack name format is `CDKToolkit-<appId>-<envId>`

- 6 chars AppId (if less than 6, add some dummy/mock chars). value is same used in qualifier
- 3 chars Environment Id. value is same used in qualifier

## References:

- [bootstrap customizing](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-customizing.html)
- [cli bootstrap options](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-bootstrap.html)
