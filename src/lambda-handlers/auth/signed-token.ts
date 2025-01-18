import * as jwt from "jsonwebtoken";
import * as datetime from "date-and-time";
import { v4 as uuidv4 } from "uuid";
import { getLogger, secretutil } from "../utils";
import { AuthRole } from "../common";
import { TokenPayload, TokenSecret } from "./auth-type";
import { _logger, _tokenSecretId } from "./base-config";

/** 1h */
const expiresInMillis = 60 * 60 * 1000;

export const getSignedToken = async (role: AuthRole) => {
  const logger = getLogger("getSignedToken", _logger);
  const iat = new Date();

  const payload: TokenPayload = {
    role: role || AuthRole.PRIMARY,
    id: uuidv4(),
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
  const signedResponse = new SignedToken(token, payload);

  logger.info("now =", Date.now(), ", new Date() =", new Date());
  logger.info("iat=", signedResponse.initializedAt);
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
  public readonly initializedAt: number;
  private readonly expiresAt: Date;
  private readonly tokenPayload: TokenPayload;

  constructor(token: string, payload: TokenPayload) {
    this.token = token;
    this.expiresAt = new Date(payload.iat + expiresInMillis);
    this.initializedAt = payload.iat;
    this.tokenPayload = payload;
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

  getTokenPayload() {
    return this.tokenPayload;
  }

  getSessionId() {
    return this.tokenPayload.id;
  }

  getUserRole() {
    return this.tokenPayload.role as AuthRole;
  }
}
