import { Algorithm } from "jsonwebtoken";
import { AuthRole } from "../common";

export interface TokenPayload {
  role: `${AuthRole}`;
  id: string;
  iat: number;
}

export interface TokenHeader {
  alg: string;
  typ: string;
}

export interface TokenSecret {
  algorithm: Algorithm;
  type: string;
  tokenSecret: string;
}
