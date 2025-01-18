import * as jsonwebtoken from "jsonwebtoken";
import * as bcrypt from "bcryptjs";

describe("play ground", () => {
  //   beforeAll(()=>{
  //     spyConsole();
  // })
  // afterAll(()=>{
  //   jest.clearAllMocks()
  // })

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
      console.log("decoded", decoded, new Date(decoded.exp as number), (decoded.exp as number) - (decoded.iat as number), Date.now());
    } catch (err) {
      console.error("unable to verify token", err);
      fail(err);
    }
  });

  test("test method arn", () => {
    const methodArn = "arn:aws:execute-api:us-east-2:${aws:PrincipalAccount}:35cxmwok3j/local/POST/user/details";
    const resource = methodArn.split(":").slice(-1)[0];
    resource.split("/").slice(2).join("/");
  });

  test("bcryptjs password", () => {
    const salt = bcrypt.genSaltSync();
    console.log("generated salt: ", salt);
    expect(salt).not.toEqual("");
  });

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
});
