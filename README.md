# personal-finance-backend-aws

This is backend api services. The backend infra setup is by environment (local, test, prod).

- The `local` environment is for development.
- The `test` environment is experimental to test through github workflow from branch `test-pipeline`.
- The `prod` environment is ready to be used as final production.

In order to use any aws services, infra stack needs to be deployed. To enable `cdk deploy`, we need to bootstrap and setup the permissions.

## Create IAM boundary

Before bootstrapping, make sure to have [IAM boundary policy](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html) in an account. if you don't have, follow steps to [create IAM policy](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create-console.html)

reference file, [my-app-env-boundary-policy.json](my-app-env-boundary-policy.json)

## Bootstrap for environment

we will customise the cdk bootstrap template to create stack for each environment.

bootstrap customized Command example

```cmd
cdk bootstrap --tags app=prsfin --toolkit-stack-name CDKToolkit-prsfin-tst --qualifier prsfintst --custom-permissions-boundary my-app-env-boundary-policy
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
