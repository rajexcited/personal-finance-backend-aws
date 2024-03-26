import * as jsonwebtoken from "jsonwebtoken";
import { getLogger } from "../../src/lambda-handlers/utils";
import * as bcrypt from "bcryptjs";

test("JWT", () => {
  //sign
  let token = null;
  try {
    const payload = {
      role: "primary",
      id: "uuid",
      iat: Date.now(),
    };

    const options: jsonwebtoken.SignOptions = {
      expiresIn: "1h",
      audience: "for authorization",
      subject: "subject",
    };

    token = jsonwebtoken.sign(payload, "dummysecret", options);
    console.log(token);
    expect(token).not.toHaveLength(0);
  } catch (err) {
    console.error("unable to sign", err);
    fail(err);
  }
  // verify
  try {
    const parts = token.split(".", 2);
    console.log("token headers", atob(parts[0]), "token payload", atob(parts[1]));
    const decoded = jsonwebtoken.verify(token, "dummysecret") as jsonwebtoken.JwtPayload;
    console.log(
      "decoded",
      decoded,
      new Date(decoded.exp as number),
      (decoded.exp as number) - (decoded.iat as number),
      Date.now()
    );
  } catch (err) {
    console.error("unable to verify token", err);
    fail(err);
  }
});

test("test method arn", () => {
  const methodArn = "arn:aws:execute-api:us-east-2:471112824979:35cxmwok3j/local/POST/user/details";
  const resource = methodArn.split(":").slice(-1)[0];
  resource.split("/").slice(2).join("/");
});

// test("console printing", () => {
//   const logger = getLogger("debugTest");
//   logger.setLogLevel("DEBUG");
//   logger.warn("setting logLevel to DEBUG");
//   logger.setLogLevel("DEBUG");
//   logger.debug("a", ["b"], { c: "c" });
//   logger.info("a", ["b"], { c: "c" });
//   logger.error("a", ["b"], { c: "c" });

//   const logger2 = getLogger("infoTest");
//   logger2.warn("setting logLevel to INFO");
//   logger2.setLogLevel("INFO");
//   logger2.debug("a", ["b"], { c: "c" });
//   logger2.info("a", ["b"], { c: "c" });
//   logger2.error("a", ["b"], { c: "c" });

//   const logger3 = getLogger("errorTest");
//   logger3.warn("setting logLevel to ERROR");
//   logger3.setLogLevel("ERROR");
//   logger3.debug("a", ["b"], { c: "c" });
//   logger3.info("a", ["b"], { c: "c" });
//   logger3.error("a", ["b"], { c: "c" });
// });

test("bcryptjs password", () => {
  // const salt = bcrypt.genSaltSync();
  const salt = "$2a$10$W/EGvoV3Bl3oqXpnXAhMq.";
  const hash = bcrypt.hashSync("password", salt);
  const salt2 = bcrypt.getSalt(hash);
  console.info("salt='" + salt + "', hash='" + hash + "'");
  expect(salt2).toEqual(salt);
  expect(bcrypt.compareSync("Password", hash)).toBeFalsy();
  expect(bcrypt.compareSync("password", hash)).toBeTruthy();
  expect(bcrypt.compareSync("p@ssword", hash)).toBeFalsy();
  expect(bcrypt.compareSync("pass", hash)).toBeFalsy();
  expect(bcrypt.compareSync("word", hash)).toBeFalsy();
});

test("date time", () => {});
