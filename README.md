# My Personal Finance AWS

My finance is a backend project to be hosted on aws product.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` or `cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` or `cdk diff` compare deployed stack with current state
- `npx cdk synth` or `cdk synth` emits the synthesized CloudFormation template

#### Environments

Before executing cdk command, configure environment name using command `set ENV=<env name>` or `export ENV=<env name>`. Depending env name, aws Cloudformation stack will be created with appropriate configuration.

| < env name > | Description                                          |
| ------------ | ---------------------------------------------------- |
| local        | useful for local development, local playground stack |
| dev          | for development                                      |
| test         | to run unit or integration or end to end tests       |
| prod         | finalize version, ready to use                       |
