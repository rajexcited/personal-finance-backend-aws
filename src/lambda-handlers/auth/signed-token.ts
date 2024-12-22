import * as jwt from "jsonwebtoken";
import * as datetime from "date-and-time";
import { getLogger, secretutil } from "../utils";
import { AuthRole } from "../common";
import { TokenPayload, TokenSecret } from "./auth-type";
import { _logger, _tokenSecretId } from "./base-config";

/** 1h */
const expiresInMillis = 60 * 60 * 1000;

export const getSignedToken = async (userId: string, role?: AuthRole) => {
  const logger = getLogger("getSignedToken", _logger);
  const iat = new Date();

  const payload: TokenPayload = {
    role: role || AuthRole.PRIMARY,
    id: userId,
    iat: iat.getTime()
  };
  logger.info("token payload", payload);

  const secret = await secretutil.getSecret<TokenSecret>(_tokenSecretId, true, logger);
  const options: jwt.SignOptions = {
    expiresIn: 60 * 60 * 1000,
    algorithm: secret.algorithm
  };

  const token = jwt.sign(payload, secret.tokenSecret, options);
  logger.info("signed token", token);
  const signedResponse = new SignedToken(token, iat);

  logger.info("now =", Date.now(), ", new Date() =", new Date());
  logger.info("iat=", signedResponse.iat);
  logger.info(
    "expiresAt =",
    signedResponse.getExpiresAt().toMillis(),
    "ms, / ",
    signedResponse.getExpiresAt().toSeconds(),
    "sec / ",
    signedResponse.getExpiresAt().toDate()
  );

  return signedResponse;
};

class SignedToken {
  public readonly token: string;
  public readonly expiresAt: Date;
  public readonly iat: number;

  constructor(token: string, iat: Date) {
    this.token = token;
    this.expiresAt = datetime.addMilliseconds(iat, expiresInMillis);
    this.iat = iat.getTime();
  }

  public expiresIn() {
    const diff = datetime.subtract(this.expiresAt, new Date());
    return Math.floor(diff.toSeconds());
  }

  public getExpiresAt() {
    return {
      toDate: () => this.expiresAt,
      toMillis: () => this.expiresAt.getTime(),
      toSeconds: () => Math.floor(this.expiresAt.getTime() / 1000)
    };
  }
}
