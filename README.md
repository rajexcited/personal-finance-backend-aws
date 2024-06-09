# My Personal Finance AWS

My finance is a backend project to be hosted on aws product.

### Useful commands

- `npm run build` compile typescript to js
- `npm run createlayer` create a lambda layer of npm dependencies
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk list` or `cdk list` List all stacks with name and constructId
- `npx cdk deploy --all` or `cdk deploy --all` deploy all stacks to your default AWS account/region
- `cdk deploy <stackConstructId> --exclusively` deploy specified stack without dependent stacks deployment
- `npx cdk diff` or `cdk diff` compare deployed stack with current state
- `npx cdk synth` or `cdk synth` emits the synthesized CloudFormation template

####Deploy UI static

1. Copy UI code to location `dist/ui`
2. Run command, `cdk deploy MyFinanceUiDeployAppStack --exclusively` to deploy only static UI code.
3. find cloudfront Distribution Id using command,

```
aws cloudformation describe-stacks --stack-name <stack-name> --query "Stacks[0].Outputs[2]"

e.g. aws cloudformation describe-stacks --stack-name app-local-myfinance-app-stack --query "Stacks[0].Outputs[2]"
```

4. invalidate cache and track progress in cloudfront ditribution with below cli commands,

```
# create
# https://awscli.amazonaws.com/v2/documentation/api/latest/reference/cloudfront/create-invalidation.html
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/ui/**" "/ui/static/**" "/personal-finance**"

e.g.
aws cloudfront create-invalidation --distribution-id E2UYXE7HDAEMQ0 --paths "/ui/**" "/ui/static/**" "/ui/static/js/**" "/personal-finance**" "/personal-finance/index.html"

# to get progress status
# https://awscli.amazonaws.com/v2/documentation/api/latest/reference/cloudfront/get-invalidation.html#examples
aws cloudfront get-invalidation --id <invalidation-id> --distribution-id <distribution-id>

e.g.
aws cloudfront get-invalidation --id I995RQ9E48HWCHXC9Q3CLSZTHR --distribution-id E2UYXE7HDAEMQ0
```

### Environments

Before executing cdk command, configure environment name using command `set ENV=<env name>` or `export ENV=<env name>`. Depending env name, aws Cloudformation stack will be created with appropriate configuration.

| < env name > | Description                                          |
| ------------ | ---------------------------------------------------- |
| local        | useful for local development, local playground stack |
| dev          | for development                                      |
| test         | to run unit or integration or end to end tests       |
| prod         | finalize version, ready to use                       |

List npm dependencies to create a lambda layer

```cmd
# dependencies of specific module
npm view uuidv4 dependencies

# list all dependencies
npm ll --omit=dev --all -p | findstr "node_modules"
```

This command will output the json with dependency name and version. install and bundle to layer.zip

### Jq Installation

To install jq on Windows 11, you can use a package manager like scoop. Scoop makes it easy to install command-line tools on Windows. Here are the steps:

1. **Install Scoop:**
   Open PowerShell as an administrator and run the following command to install Scoop:

   ```powershell
   Set-ExecutionPolicy RemoteSigned -scope CurrentUser
   iwr -useb get.scoop.sh | iex
   ```

2. **Install jq using Scoop:**
   After installing Scoop, you can use it to install jq. In the same PowerShell window, run:

   ```powershell
   scoop install jq
   ```

   This will download and install jq on your Windows machine.

3. **Verify jq Installation:**
   To verify that jq is installed correctly, you can run the following command:

   ```powershell
   jq --version
   ```

   This should display the installed version of jq.

Now you have jq installed on your Windows 11 machine, and you can use it in scripts or from the command line. If you encounter any issues during the installation, refer to the official Scoop documentation for troubleshooting: [Scoop GitHub Repository](https://github.com/lukesampson/scoop).

Keep in mind that Scoop requires PowerShell 5.1 or later, so make sure you have an updated version of PowerShell.
