import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";

export class AuthNotConfiguredError extends Error {
  constructor(message = "Authentication is not configured (JWT_SECRET missing).") {
    super(message);
    this.name = "AuthNotConfiguredError";
  }
}

export class AuthFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthFailedError";
  }
}

export type AuthSession = {
  user_id: string;
  access_token: string;
  refresh_token: string;
};

export type AuthService = {
  register: (email: string, password: string, displayName: string) => Promise<AuthSession>;
  login: (email: string, password: string) => Promise<AuthSession>;
};

type LocalUser = {
  userId: string;
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
};

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new AuthNotConfiguredError();
  return secret;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function signTokens(userId: string, email: string, name: string): AuthSession {
  const secret = requireJwtSecret();
  const access_token = jwt.sign(
    { sub: userId, email, name, full_name: name },
    secret,
    { algorithm: "HS256", expiresIn: "12h" },
  );
  const refresh_token = jwt.sign(
    { sub: userId, typ: "refresh" },
    secret,
    { algorithm: "HS256", expiresIn: "30d" },
  );
  return { user_id: userId, access_token, refresh_token };
}

/** Local JWT auth for Phase 1 / tests. Swap to Supabase when project credentials exist. */
export function createLocalAuthService(users = new Map<string, LocalUser>()): AuthService & {
  _users: Map<string, LocalUser>;
} {
  return {
    _users: users,
    async register(email, password, displayName) {
      requireJwtSecret();
      const normalized = email.trim().toLowerCase();
      if (users.has(normalized)) {
        throw new AuthFailedError("An account with this email already exists.");
      }
      const salt = randomBytes(16).toString("hex");
      const user: LocalUser = {
        userId: randomUUID(),
        email: normalized,
        name: displayName.trim(),
        passwordSalt: salt,
        passwordHash: hashPassword(password, salt),
      };
      users.set(normalized, user);
      return signTokens(user.userId, user.email, user.name);
    },
    async login(email, password) {
      requireJwtSecret();
      const normalized = email.trim().toLowerCase();
      const user = users.get(normalized);
      if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
        throw new AuthFailedError("Invalid email or password.");
      }
      return signTokens(user.userId, user.email, user.name);
    },
  };
}

export function createDefaultAuthService(): AuthService {
  return createLocalAuthService();
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
