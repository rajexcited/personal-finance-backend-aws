/*
 * This file is coded from referencing the example given in following link
 * https://github.com/aws-samples/aws-secrets-manager-rotation-lambdas/blob/master/SecretsManagerRotationTemplate/lambda_function.py
 *
 */

import {
  SecretsManagerClient,
  GetRandomPasswordCommand,
  DescribeSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  UpdateSecretVersionStageCommand,
} from "@aws-sdk/client-secrets-manager"; // ES Modules import
import { SecretsManagerRotationEvent, SecretsManagerRotationHandler } from "aws-lambda";

const client = new SecretsManagerClient();

/**
 *
 *
 * @param event
 * @param context
 * @throws
 *
 * ResourceNotFoundException: If the secret with the specified arn and stage does not exist
 *
 * ValueError: If the secret is not properly configured for rotation
 *
 * KeyError: If the event parameters do not contain the expected keys
 */
export const secretRotator: SecretsManagerRotationHandler = async (event, context) => {
  console.debug("event", event);

  const describeCmd = new DescribeSecretCommand({
    SecretId: event.SecretId,
  });
  const describeResult = await client.send(describeCmd);
  console.info("describeCmd", describeCmd, "describeResult", describeResult);

  if (!describeResult.VersionIdsToStages) {
    console.error("Secret [" + event.SecretId + "] is not enabled for rotation");
    throw new Error("Secret [" + event.SecretId + "] is not enabled for rotation");
  }
  if (!describeResult.VersionIdsToStages[event.ClientRequestToken]) {
    console.error("Secret version [" + event.ClientRequestToken + "] has no stage for rotation of secret [" + event.SecretId + "].");
    throw new Error("Secret version [" + event.ClientRequestToken + "] has no stage for rotation of secret [" + event.SecretId + "].");
  }
  if (describeResult.VersionIdsToStages[event.ClientRequestToken].includes("AWSCURRENT")) {
    console.warn("Secret version [" + event.ClientRequestToken + "] already set as AWSCURRENT for secret [" + event.SecretId + "].");
    return;
  }
  if (describeResult.VersionIdsToStages[event.ClientRequestToken].includes("AWSPENDING")) {
    console.warn("Secret version [" + event.ClientRequestToken + "] already set as AWSPENDING for secret [" + event.SecretId + "].");
    throw new Error("Secret version [" + event.ClientRequestToken + "] already set as AWSPENDING for secret [" + event.SecretId + "].");
  }

  if (event.Step === "createSecret") {
    await createSecret(event);
  } else if (event.Step === "setSecret") {
    await setSecret(event);
  } else if (event.Step === "testSecret") {
    await testSecret(event);
  } else if (event.Step === "finishSecret") {
    await finishSecret(event);
  } else {
    throw new Error("Invalid Step Parameter");
  }
};

/**
 * This method first checks for the existence of a secret for the passed in token. If one does not exist, it will generate a
 * new secret and put it with the passed in token.
 *
 * @param event
 */
const createSecret = async (event: SecretsManagerRotationEvent) => {
  try {
    const getValueCmd = new GetSecretValueCommand({
      SecretId: event.SecretId,
      VersionId: event.ClientRequestToken,
      VersionStage: "AWSPENDING",
    });
    const getValueResult = await client.send(getValueCmd);
    console.info("successfully retrieved secret for [" + event.SecretId + "].");
  } catch (err) {
    const passwordStr = await generatePassword();
    const putSecretCmd = new PutSecretValueCommand({
      SecretId: event.SecretId,
      ClientRequestToken: event.ClientRequestToken,
      SecretString: passwordStr,
      VersionStages: ["AWSPENDING"],
    });
    const putSecretResult = await client.send(putSecretCmd);
    console.debug("putSecretCmd", putSecretCmd, "putSecretResult", putSecretResult);
  }
};

/**
 * This method should set the AWSPENDING secret in the service that the secret belongs to. For example, if the secret is a database
 * credential, this method should take the value of the AWSPENDING secret and set the user's password to this value in the database.
 *
 * @param event
 */
const setSecret = async (event: SecretsManagerRotationEvent) => {
  // update other services or storage where new secret should be used.
  // for accessToken, there is no other place to update.
  console.info("setSecret", "not implemented");
};

/**
 * This method should validate that the AWSPENDING secret works in the service that the secret belongs to. For example, if the secret
 * is a database credential, this method should validate that the user can login with the password in AWSPENDING and that the user has
 * all of the expected permissions against the database.
 *
 * @param event
 */
const testSecret = async (event: SecretsManagerRotationEvent) => {
  // validate if jwt encryption can be accomplish with newly created secret
  const getValueCmd = new GetSecretValueCommand({
    SecretId: event.SecretId,
    VersionId: event.ClientRequestToken,
    VersionStage: "AWSPENDING",
  });
  const getValueResult = await client.send(getValueCmd);
  console.debug("getValueCmd", getValueCmd, "getValueResult", getValueResult);
};

/**
 * This method finalizes the rotation process by marking the secret version passed in as the AWSCURRENT secret.
 *
 * @param event
 */
const finishSecret = async (event: SecretsManagerRotationEvent) => {
  const describeCmd = new DescribeSecretCommand({
    SecretId: event.SecretId,
  });
  const describeResult = await client.send(describeCmd);
  console.info("describeCmd", describeCmd, "describeResult", describeResult);
  if (!describeResult.VersionIdsToStages) {
    throw new Error("Secret [" + event.SecretId + "] is not describable in finishSecret step");
  }
  for (const version in describeResult.VersionIdsToStages) {
    console.info("version", version, "describeResult.VersionIdsToStages[version]", describeResult.VersionIdsToStages[version]);
    if (describeResult.VersionIdsToStages[version].includes("AWSCURRENT")) {
      if (version === event.ClientRequestToken) {
        console.info("finishSecret: Version [" + version + "] already marked as AWSCURRENT for [" + event.SecretId + "]");
      } else {
        const updateStageCmd = new UpdateSecretVersionStageCommand({
          SecretId: event.SecretId,
          VersionStage: "AWSCURRENT",
          MoveToVersionId: event.ClientRequestToken,
          RemoveFromVersionId: version,
        });
        const updateStageResult = await client.send(updateStageCmd);
        console.log("updateStageCmd", updateStageCmd, "updateStageResult", updateStageResult);
      }
      break;
    }
    console.debug("in forloop", "version", version, "VersionIdsToStages", describeResult.VersionIdsToStages);
  }
};

const generatePassword = async () => {
  const getPasswordCmd = new GetRandomPasswordCommand({});
  const getPasswordResult = await client.send(getPasswordCmd);
  console.debug("getPasswordCmd", getPasswordCmd, "getPasswordResult", getPasswordResult);

  const templatedObj = { pwd: getPasswordResult.RandomPassword };
  console.info("templatedObj result", templatedObj);
  return JSON.stringify(templatedObj);
};
