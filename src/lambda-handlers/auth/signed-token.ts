import * as jwt from "jsonwebtoken";
import * as datetime from "date-and-time";
import { getLogger } from "../utils";
import { AuthRole } from "../common";
import { TokenPayload } from "./auth-type";
import { _logger } from "./base-config";
import { getSecret } from "./token-secret";

export const getSignedToken = async (userId: string, role?: AuthRole) => {
  const logger = getLogger("getSignedToken", _logger);
  const iat = new Date();

  const payload: TokenPayload = {
    role: role || AuthRole.PRIMARY,
    id: userId,
    iat: iat.getTime(),
  };
  logger.info("token payload", payload);

  const secret = await getSecret();
  const options: jwt.SignOptions = {
    expiresIn: "1h",
    algorithm: secret.algorithm,
  };

  const token = jwt.sign(payload, secret.tokenSecret, options);
  logger.info("signed token", token);
  return new SignedToken(token, iat);
};

class SignedToken {
  public readonly token: string;
  public readonly initialExpiresIn: number;
  public readonly expiresAt: Date;
  public readonly iat: number;

  constructor(token: string, iat: Date) {
    this.initialExpiresIn = 60 * 60;
    this.token = token;
    this.expiresAt = datetime.addSeconds(new Date(iat), this.initialExpiresIn);
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
      toSeconds: () => Math.floor(this.expiresAt.getTime() / 1000),
    };
  }
}
