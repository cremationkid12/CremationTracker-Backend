import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { isSupabaseAuthConfigured } from "../auth/supabaseAccessTokenUser";

export class AuthNotConfiguredError extends Error {
  constructor(
    message = "Authentication is not configured (set SUPABASE_URL + SUPABASE_ANON_KEY, or JWT_SECRET for local auth).",
  ) {
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
  refresh?: (refreshToken: string) => Promise<AuthSession>;
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
  if (!secret) throw new AuthNotConfiguredError("JWT_SECRET is required for local auth.");
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

function getSupabaseAuthClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new AuthNotConfiguredError("Supabase auth is not configured.");
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function allowAutoConfirmEmail(): boolean {
  if (process.env.ALLOW_AUTO_CONFIRM_EMAIL === "true") return true;
  if (process.env.ALLOW_AUTO_CONFIRM_EMAIL === "false") return false;
  return process.env.NODE_ENV !== "production";
}

async function sessionFromPassword(email: string, password: string): Promise<AuthSession> {
  const client = getSupabaseAuthClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new AuthFailedError(error.message);
  if (!data.user?.id || !data.session?.access_token || !data.session?.refresh_token) {
    throw new AuthFailedError("Login did not return a complete auth session.");
  }
  return {
    user_id: data.user.id,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
}

async function confirmEmailAndSignIn(userId: string, email: string, password: string): Promise<AuthSession> {
  const admin = getSupabaseAdminClient();
  if (!admin || !allowAutoConfirmEmail()) {
    throw new AuthFailedError(
      "Account created but no session returned. Disable Confirm email in Supabase Auth (Authentication → Providers → Email), or confirm the email first.",
    );
  }
  const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
  if (error) throw new AuthFailedError(error.message);
  return sessionFromPassword(email, password);
}

/** Production auth via dedicated Cremation Tracker Supabase project. */
export function createSupabaseAuthService(): AuthService {
  return {
    async register(email, password, displayName) {
      const client = getSupabaseAuthClient();
      const trimmedEmail = email.trim();
      const trimmedName = displayName.trim();
      const { data, error } = await client.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            display_name: trimmedName,
            full_name: trimmedName,
            name: trimmedName,
          },
        },
      });

      if (error) {
        const already =
          /already registered|already exists|user already/i.test(error.message);
        if (already) {
          const admin = getSupabaseAdminClient();
          if (admin && allowAutoConfirmEmail()) {
            const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
            const existing = listed.data.users.find(
              (u) => u.email?.toLowerCase() === trimmedEmail.toLowerCase(),
            );
            if (existing?.id) {
              return confirmEmailAndSignIn(existing.id, trimmedEmail, password);
            }
          }
        }
        throw new AuthFailedError(error.message);
      }
      if (!data.user?.id) {
        throw new AuthFailedError("Register did not return a user.");
      }
      if (data.session?.access_token && data.session?.refresh_token) {
        return {
          user_id: data.user.id,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        };
      }
      return confirmEmailAndSignIn(data.user.id, trimmedEmail, password);
    },

    async login(email, password) {
      const client = getSupabaseAuthClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw new AuthFailedError(error.message);
      if (!data.user?.id || !data.session?.access_token || !data.session?.refresh_token) {
        throw new AuthFailedError("Login did not return a complete auth session.");
      }
      return {
        user_id: data.user.id,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
    },

    async refresh(refreshToken) {
      const client = getSupabaseAuthClient();
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (error) throw new AuthFailedError(error.message);
      if (!data.user?.id || !data.session?.access_token || !data.session?.refresh_token) {
        throw new AuthFailedError("Refresh did not return a complete auth session.");
      }
      return {
        user_id: data.user.id,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
    },
  };
}

/** Local JWT auth for tests / offline smoke without Supabase. */
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
  if (isSupabaseAuthConfigured()) {
    return createSupabaseAuthService();
  }
  return createLocalAuthService();
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
