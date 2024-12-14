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
import { SecretStringGenerator } from "aws-cdk-lib/aws-secretsmanager";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcryptjs";
import { TokenSecret } from "./auth-type";
import { utils, getLogger, LoggerBase } from "../utils";
import { ValidationError, JSONObject } from "../apigateway";

const client = new SecretsManagerClient();
const _logger = getLogger("token-rotator");

interface AuthSecretValueMap {
  psalt: { current: string; previous: string };
  tokenSecret: string;
  algorithm: string;

  type: string;
}

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
  const logger = getLogger("secretRotate", _logger);
  logger.debug("event", event);

  const describeCmd = new DescribeSecretCommand({
    SecretId: event.SecretId,
  });
  const describeResult = await client.send(describeCmd);
  logger.info("describeCmd", describeCmd, "describeResult", describeResult);

  if (!describeResult.VersionIdsToStages) {
    logger.error("Secret [" + event.SecretId + "] is not enabled for rotation");
    throw new Error("Secret [" + event.SecretId + "] is not enabled for rotation");
  }
  if (!describeResult.VersionIdsToStages[event.ClientRequestToken]) {
    logger.error("Secret version [" + event.ClientRequestToken + "] has no stage for rotation of secret [" + event.SecretId + "].");
    throw new Error("Secret version [" + event.ClientRequestToken + "] has no stage for rotation of secret [" + event.SecretId + "].");
  }
  if (describeResult.VersionIdsToStages[event.ClientRequestToken].includes("AWSCURRENT")) {
    logger.warn("Secret version [" + event.ClientRequestToken + "] already set as AWSCURRENT for secret [" + event.SecretId + "].");
    return;
  }
  if (describeResult.VersionIdsToStages[event.ClientRequestToken].includes("AWSPENDING")) {
    logger.warn("Secret version [" + event.ClientRequestToken + "] already set as AWSPENDING for secret [" + event.SecretId + "].");
    throw new Error("Secret version [" + event.ClientRequestToken + "] already set as AWSPENDING for secret [" + event.SecretId + "].");
  }

  if (event.Step === "createSecret") {
    // creates new random value for rotation
    await createSecret(event);
  } else if (event.Step === "setSecret") {
    // sets generated / created secret to downstream system
    await setSecret(event);
  } else if (event.Step === "testSecret") {
    // tests validity
    await testSecret(event);
  } else if (event.Step === "finishSecret") {
    // finalize the version to clean up rotation
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
  const logger = getLogger("createSecret", _logger);
  try {
    const getValueCmd = new GetSecretValueCommand({
      SecretId: event.SecretId,
      VersionId: event.ClientRequestToken,
      VersionStage: "AWSPENDING",
    });
    const getValueResult = await client.send(getValueCmd);
    const obj = utils.getJsonObj<AuthSecretValueMap>(getValueResult.SecretString as string);
    if (!obj || !obj.tokenSecret || !obj.psalt.current || obj.psalt.current === obj.psalt.previous) {
      throw new Error("create proper format for auth secret with all required value");
    }
    logger.info("successfully retrieved secret for [" + event.SecretId + "].");
  } catch (err) {
    const passwordStr = await generatePassword(event, logger);
    const putSecretCmd = new PutSecretValueCommand({
      SecretId: event.SecretId,
      ClientRequestToken: event.ClientRequestToken,
      SecretString: passwordStr,
      VersionStages: ["AWSPENDING"],
    });
    const putSecretResult = await client.send(putSecretCmd);
    logger.debug("putSecretCmd", putSecretCmd, "putSecretResult", putSecretResult);
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
  _logger.info("setSecret", "not implemented", "nothing to do");
};

/**
 * This method should validate that the AWSPENDING secret works in the service that the secret belongs to. For example, if the secret
 * is a database credential, this method should validate that the user can login with the password in AWSPENDING and that the user has
 * all of the expected permissions against the database.
 *
 * @param event
 */
const testSecret = async (event: SecretsManagerRotationEvent) => {
  const logger = getLogger("testSecret", _logger);
  // validate if jwt encryption can be accomplish with newly created secret
  const getValueCmd = new GetSecretValueCommand({
    SecretId: event.SecretId,
    VersionId: event.ClientRequestToken,
    VersionStage: "AWSPENDING",
  });
  const getValueResult = await client.send(getValueCmd);
  logger.debug("getValueCmd", getValueCmd, "getValueResult", getValueResult);
  const secretObj = utils.getJsonObj<TokenSecret>(getValueResult.SecretString as string);
  if (!secretObj || !secretObj.tokenSecret) {
    throw new ValidationError([{ path: "secret", message: "invalid json" }]);
  }
  const token = jwt.sign({}, secretObj.tokenSecret, { algorithm: secretObj.algorithm });
  logger.info("encrypted token", token);
  const decoded = jwt.verify(token, secretObj.tokenSecret) as jwt.JwtPayload;
  logger.info("decrypted", decoded);

  const saltSecret = (secretObj as AuthSecretValueMap).psalt;
  if (!saltSecret.current || saltSecret.current === saltSecret.previous) {
    throw new ValidationError([{ path: "salt-current", message: "same value as previous" }]);
  }
  const hash = bcrypt.hashSync("testpassword", saltSecret.current);
  const currSalt = bcrypt.getSalt(hash);
  if (currSalt !== saltSecret.current) {
    throw new ValidationError([{ path: "salt-current", message: "incorrect salt value" }]);
  }
};

/**
 * This method finalizes the rotation process by marking the secret version passed in as the AWSCURRENT secret.
 *
 * @param event
 */
const finishSecret = async (event: SecretsManagerRotationEvent) => {
  const logger = getLogger("finishSecret", _logger);
  const describeCmd = new DescribeSecretCommand({
    SecretId: event.SecretId,
  });
  const describeResult = await client.send(describeCmd);
  logger.info("describeCmd", describeCmd, "describeResult", describeResult);
  if (!describeResult.VersionIdsToStages) {
    throw new Error("Secret [" + event.SecretId + "] is not describable in finishSecret step");
  }
  for (const version in describeResult.VersionIdsToStages) {
    logger.info("version", version, "describeResult.VersionIdsToStages[version]", describeResult.VersionIdsToStages[version]);
    if (describeResult.VersionIdsToStages[version].includes("AWSCURRENT")) {
      if (version === event.ClientRequestToken) {
        logger.info("finishSecret: Version [" + version + "] already marked as AWSCURRENT for [" + event.SecretId + "]");
      } else {
        const updateStageCmd = new UpdateSecretVersionStageCommand({
          SecretId: event.SecretId,
          VersionStage: "AWSCURRENT",
          MoveToVersionId: event.ClientRequestToken,
          RemoveFromVersionId: version,
        });
        const updateStageResult = await client.send(updateStageCmd);
        logger.log("updateStageCmd", updateStageCmd, "updateStageResult", updateStageResult);
      }
      break;
    }
    logger.debug("in forloop", "version", version, "VersionIdsToStages", describeResult.VersionIdsToStages);
  }
};

const generatePassword = async (event: SecretsManagerRotationEvent, loggerBase: LoggerBase) => {
  const logger = getLogger("generatePassword", loggerBase);
  const generateTokenConfiguration = utils.getJsonObj<SecretStringGenerator>(process.env.TOKEN_GENERATE_CONFIG as string);
  logger.info("generateTokenConfiguration", generateTokenConfiguration);
  if (!generateTokenConfiguration) {
    throw new ValidationError([{ path: "token-config", message: "token config value is not valid json" }]);
  }

  const templatedObj = await getTemplateObject(event, generateTokenConfiguration, logger);
  logger.info("templatedObj", templatedObj);
  if (!templatedObj) {
    throw new ValidationError([{ path: "secret-template", message: "invalid json" }]);
  }

  templatedObj.tokenSecret = await getRandomToken(generateTokenConfiguration, logger);

  // generate random salt
  templatedObj.psalt.previous = templatedObj.psalt.current;
  templatedObj.psalt.current = getRandomSalt(generateTokenConfiguration, logger);

  logger.info("templatedObj result", templatedObj);
  return JSON.stringify(templatedObj);
};

const getTemplateObject = async (event: SecretsManagerRotationEvent, generateTokenConfiguration: SecretStringGenerator, loggerBase: LoggerBase) => {
  const logger = getLogger("getTemplateObject", loggerBase);
  const getValueCmd = new GetSecretValueCommand({ SecretId: event.SecretId });
  const getValueResult = await client.send(getValueCmd);
  logger.info("currently active secret value result is ", getValueResult);
  let templateString = generateTokenConfiguration?.secretStringTemplate as string;
  if (getValueResult.SecretString) {
    templateString = getValueResult.SecretString;
  }
  const templatedObj = utils.getJsonObj<AuthSecretValueMap>(templateString);
  logger.info("using env template instead of existing secret value");
  if (templatedObj) {
    return templatedObj;
  }
  throw new Error("should never be thrown");
};

const getRandomToken = async (generateTokenConfiguration: SecretStringGenerator, loggerBase: LoggerBase) => {
  const logger = getLogger("getRandomToken", loggerBase);

  // generate random token hash
  const getPasswordCmd = new GetRandomPasswordCommand({
    PasswordLength: generateTokenConfiguration.passwordLength,
    ExcludeCharacters: generateTokenConfiguration.excludeCharacters,
    ExcludeNumbers: generateTokenConfiguration.excludeNumbers,
    ExcludePunctuation: generateTokenConfiguration.excludePunctuation,
    ExcludeUppercase: generateTokenConfiguration.excludeUppercase,
    ExcludeLowercase: generateTokenConfiguration.excludeLowercase,
    IncludeSpace: generateTokenConfiguration.includeSpace,
    RequireEachIncludedType: generateTokenConfiguration.requireEachIncludedType,
  });
  const getPasswordResult = await client.send(getPasswordCmd);
  logger.debug("getPasswordCmd", getPasswordCmd, "getPasswordResult", getPasswordResult);
  if (!getPasswordResult.RandomPassword) {
    throw new ValidationError([{ path: "random-password", message: "incorrect value" }]);
  }

  return getPasswordResult.RandomPassword;
};

const getRandomSalt = (generateTokenConfiguration: SecretStringGenerator, loggerBase: LoggerBase) => {
  const logger = getLogger("getRandomSalt", loggerBase);

  return bcrypt.genSaltSync(generateTokenConfiguration.passwordLength);
};
