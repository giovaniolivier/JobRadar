import jwt from "jsonwebtoken";

const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is not set");
  return value;
};

export type JwtPayload = {
  userId: string;
  email: string;
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret()) as JwtPayload;
}
