import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { PairingResponse } from "@codex-phone/shared";
import { StateStore, type StoredToken } from "./persistence.js";

const hashPin = (pin: string) => crypto.createHash("sha256").update(pin).digest("hex");

const randomPin = () => String(Math.floor(100000 + Math.random() * 900000));

const timingSafeMatch = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export class AuthService {
  constructor(
    private readonly stateStore: StateStore,
    private readonly sessionTtlMs: number,
    configuredPin: string | null
  ) {
    const state = this.stateStore.read();
    if (!state.pinHash) {
      const pin = configuredPin ?? randomPin();
      this.stateStore.update((current) => ({
        ...current,
        pinHash: hashPin(pin),
        pairingHint: pin
      }));
      console.log(`[codex-phone] Pairing PIN: ${pin}`);
    }
  }

  getPairingHint() {
    return this.stateStore.read().pairingHint ?? "configured";
  }

  pair(pin: string, deviceName: string): PairingResponse | null {
    const state = this.stateStore.read();
    if (!state.pinHash || !timingSafeMatch(state.pinHash, hashPin(pin))) {
      return null;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + this.sessionTtlMs;
    const storedToken: StoredToken = { token, deviceName, expiresAt };

    this.stateStore.update((current) => ({
      ...current,
      pairingHint: null,
      tokens: [...current.tokens.filter((entry) => entry.expiresAt > Date.now()), storedToken]
    }));

    return { token, expiresAt, deviceName };
  }

  validateToken(token: string | null): StoredToken | null {
    if (!token) {
      return null;
    }

    return (
      this.stateStore
        .read()
        .tokens.find((entry) => entry.token === token && entry.expiresAt > Date.now()) ?? null
    );
  }

  getTrustedDeviceName(token: string | null) {
    return this.validateToken(token)?.deviceName ?? null;
  }

  authMiddleware = (request: Request, response: Response, next: NextFunction) => {
    const header = request.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const token = bearer ?? (typeof request.query.token === "string" ? request.query.token : null);
    const valid = this.validateToken(token);

    if (!valid) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }

    request.headers["x-codex-phone-device"] = valid.deviceName;
    next();
  };
}

