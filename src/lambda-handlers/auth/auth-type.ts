import { Algorithm } from "jsonwebtoken";

export enum Role {
  PRIMARY = "primary",
  ADMIN = "admin",
}

export interface TokenPayload {
  role: `${Role}`;
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
