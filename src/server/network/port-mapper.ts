import { networkInterfaces } from "node:os";

import { upnpNat, type Gateway } from "@achingbrain/nat-port-mapper";

export interface HostAddressCandidate {
  address: string;
  family: string | number;
  internal: boolean;
}

export interface UpnpPortMappingResult {
  ok: boolean;
  internalHost?: string;
  externalIp?: string;
  externalPort?: number;
  gatewayHost?: string;
  reason?: string;
}

let activeGateway: Gateway | null = null;
let cleanupRegistered = false;

export function pickPreferredPrivateIpv4(
  candidates: HostAddressCandidate[],
): string | null {
  const ranked = candidates
    .filter((candidate) => !candidate.internal && candidate.family === "IPv4")
    .map((candidate) => ({
      address: candidate.address,
      rank: privateIpv4Rank(candidate.address),
    }))
    .filter((candidate): candidate is { address: string; rank: number } => candidate.rank !== null)
    .sort((left, right) => left.rank - right.rank || left.address.localeCompare(right.address));

  return ranked[0]?.address ?? null;
}

export async function attemptUpnpPortMapping(
  port: number,
): Promise<UpnpPortMappingResult> {
  const internalHost = pickPreferredPrivateIpv4(collectHostAddressCandidates());
  if (internalHost === null) {
    return {
      ok: false,
      reason: "No private IPv4 address was found on this machine.",
    };
  }

  const client = upnpNat({
    autoRefresh: true,
    description: "Codex Mobile WebUI",
  });

  let lastError: unknown;

  try {
    for await (const gateway of client.findGateways({
      signal: AbortSignal.timeout(5_000),
    })) {
      try {
        const mapping = await gateway.map(port, internalHost, {
          externalPort: port,
          protocol: "tcp",
          description: "Codex Mobile WebUI",
          signal: AbortSignal.timeout(5_000),
        });

        const externalIp = await gateway
          .externalIp({
            signal: AbortSignal.timeout(5_000),
          })
          .catch(() => undefined);

        if (activeGateway !== null && activeGateway !== gateway) {
          void activeGateway.stop().catch(() => undefined);
        }

        activeGateway = gateway;
        registerCleanup();

        return {
          ok: true,
          internalHost: mapping.internalHost,
          externalIp,
          externalPort: mapping.externalPort,
          gatewayHost: gateway.host,
        };
      } catch (error) {
        lastError = error;
        await gateway.stop().catch(() => undefined);
      }
    }
  } catch (error) {
    lastError = error;
  }

  return {
    ok: false,
    internalHost,
    reason:
      formatPortMappingError(lastError) ??
      "No UPnP gateway responded on the local network.",
  };
}

function collectHostAddressCandidates(): HostAddressCandidate[] {
  return Object.values(networkInterfaces()).flatMap((addresses) =>
    (addresses ?? []).map((address) => ({
      address: address.address,
      family: address.family,
      internal: address.internal,
    })),
  );
}

function privateIpv4Rank(address: string): number | null {
  if (address.startsWith("192.168.")) {
    return 0;
  }

  if (address.startsWith("10.")) {
    return 1;
  }

  const octets = address.split(".").map((segment) => Number(segment));
  if (
    octets.length === 4 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    octets[0] === 172 &&
    octets[1] >= 16 &&
    octets[1] <= 31
  ) {
    return 2;
  }

  return null;
}

function formatPortMappingError(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return null;
}

function registerCleanup(): void {
  if (cleanupRegistered) {
    return;
  }

  cleanupRegistered = true;

  const cleanup = (): void => {
    if (activeGateway === null) {
      return;
    }

    void activeGateway.stop().catch(() => undefined);
    activeGateway = null;
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
  process.once("beforeExit", cleanup);
}
