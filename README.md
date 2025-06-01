# AWS Manual Setup for Cdk deploy

The backend API services infrastructure setup is environment-specific. Below are the different environments:

- The `development` environment is for developer/local use.
- The `testplan` environment is for executing test plans (regression, feature, etc.) to test code.
- The `production` environment is used during release.
- The `experiment` environment is for experimenting with AWS services, AWS access, workflow integration, etc. The `test-pipeline` branch can be useful for this.

The infra stack needs to be deployed for all base infrastructure changes. To enable `cdk deploy`, we need to bootstrap and setup the permissions.

## Create CI CD Role

To enable workflow integration with your AWS account, you need to create a role following github guide lines. Created create cicd role scripts by referencing below [Ref Docs](#ref-docs)

Command to create ci cd role

```cmd
python -m scripts.create-cicd-role --create --cicd-role-base-dir cicd-role --aws-account <aws account number> --environment <one of supported value> --github-owner <github account id> --github-repo <repository where workflow will be connecting to AWS>
# example,
python -m scripts.create-cicd-role --create --cicd-role-base-dir cicd-role --aws-account 111111111111 --environment experiment --github-owner rajexcited --github-repo-aws personal-finance-backend-aws --github-repo-ui personal-finance-ui
```

add `--dry-run` param, if you would like to simulate the role creation. Each IAM request and response are stored under `dist` directory,

### Ref Docs:

- [Use IAM roles to connect GitHub Actions to actions in AWS](https://aws.amazon.com/blogs/security/use-iam-roles-to-connect-github-actions-to-actions-in-aws/)
- [Github aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials?tab=readme-ov-file#OIDC)
- [AWS SDKs and Tools standardized credential providers](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html)
- [AWS security credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/security-creds.html)
- [Apply least-privilege permissions](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege)
- [Github - Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [Github - About security hardening with OpenID Connect](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

## IAM policies for CDK deployment

The CDK bootstrap process will create or update IAM policies as required for execution role. These policies are controlling factor to permit cloudformation actions when executing `cdk deploy` command.

If need to update permissions of cdk/cloudformation access, check the [cdk role directory](/cdk-roles/)

### Ref Docs:

- [create IAM policy](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create-console.html)
- [IAM examples using Python Boto3](https://docs.aws.amazon.com/code-library/latest/ug/python_3_iam_code_examples.html)
- [Boto3 IAM Client](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/iam.html)

## Bootstrap for environment

Bootstrap is customize for permissions. Because same account is supporting all the environments.

Command to create bootstrap stack

```cmd
python -m scripts.bootstrap-cdk --bootstrap --aws-account <aws account number> --cdk-roles-dir cdk-roles --environment <one of supported value>

# example,
python -m scripts.bootstrap-cdk --bootstrap --aws-account 111111111111 --cdk-roles-dir cdk-roles --environment experiment
```

add `--dry-run` param, if you would like to simulate the role creation.
add `--destroy --delete-policies` params, if you would like to delete bootstrap stack along with custom policies.

> Each AWS request and response are stored under `dist` directory.

### Ref Docs:

- [bootstrap customizing](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-customizing.html)
- [cli bootstrap options](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-bootstrap.html)

## Update Custom Policy

After role and bootstrap stack are setup, there will time to update permissions existing custom policies that role uses. So, instead of delete and re-create, run the update policy command. Update the policy json file with new permissions and run below command.

```cmd
python -m scripts.iam-policy --update --aws-account <aws account number> --policy-path <file path to policy json> --environment <one of supported value>

# example,
python -m scripts.iam-policy --update --aws-account 111111111111 --policy-path cdk-roles/cfn-exec-role/policies/custom/storage-policy.json --environment testplan
```

add `--dry-run` param, if you would like to simulate the policy update.
