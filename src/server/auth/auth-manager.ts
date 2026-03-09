import argon2 from "argon2";
import { randomBytes, timingSafeEqual } from "node:crypto";

import type { PersistedState } from "../../shared/contracts";
import { JsonStore } from "../state/json-store";

export class AuthManager {
  private readonly sessions = new Set<string>();

  constructor(private readonly store: JsonStore) {}

  async hasSetup(): Promise<boolean> {
    const state = await this.store.read();
    return Boolean(state.auth.pinHash);
  }

  async setup(pin: string): Promise<void> {
    const normalized = normalizePin(pin);
    const hash = await argon2.hash(normalized);

    await this.store.write((state) => ({
      ...state,
      auth: {
        ...state.auth,
        pinHash: hash,
      },
    }));
  }

  async verify(pin: string): Promise<boolean> {
    const state = await this.store.read();
    if (!state.auth.pinHash) {
      return false;
    }

    return argon2.verify(state.auth.pinHash, normalizePin(pin));
  }

  issueSession(): string {
    const token = randomBytes(24).toString("hex");
    this.sessions.add(token);
    return token;
  }

  revokeSession(token: string | undefined): void {
    if (token) {
      this.sessions.delete(token);
    }
  }

  isSessionValid(token: string | undefined): boolean {
    if (!token) {
      return false;
    }

    for (const value of this.sessions) {
      if (safeEquals(value, token)) {
        return true;
      }
    }

    return false;
  }

  async getCookieSecret(): Promise<string> {
    const state = await this.store.read();
    return state.auth.cookieSecret;
  }

  async getState(): Promise<PersistedState> {
    return this.store.read();
  }
}

function normalizePin(pin: string): string {
  return pin.trim();
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
