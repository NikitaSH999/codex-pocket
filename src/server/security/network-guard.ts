import { networkInterfaces } from "node:os";

export type NetworkAccessMode = "private" | "public";

interface InterfaceAddressLike {
  address: string;
  netmask: string;
  internal: boolean;
}

export function collectAllowedCidrs(addresses: InterfaceAddressLike[]): string[] {
  const cidrs = new Set<string>(["127.0.0.0/8"]);

  for (const address of addresses) {
    if (!isIpv4(address.address)) {
      continue;
    }

    if (address.internal) {
      cidrs.add("127.0.0.0/8");
      continue;
    }

    if (!isPrivateIpv4(address.address)) {
      continue;
    }

    cidrs.add(toCidr(address.address, address.netmask));
  }

  return [...cidrs];
}

export function collectAllowedCidrsFromSystem(): string[] {
  const interfaces = networkInterfaces();
  const entries: InterfaceAddressLike[] = [];

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4") {
        entries.push({
          address: address.address,
          netmask: address.netmask,
          internal: address.internal,
        });
      }
    }
  }

  return collectAllowedCidrs(entries);
}

export function ipAllowedByCidrs(ip: string, cidrs: string[]): boolean {
  const normalized = normalizeIp(ip);

  if (!normalized || !isIpv4(normalized)) {
    return false;
  }

  const ipInt = ipv4ToInt(normalized);

  return cidrs.some((cidr) => {
    const [base, prefix] = cidr.split("/");
    if (!base || !prefix) {
      return false;
    }

    const baseInt = ipv4ToInt(base);
    const mask = prefixToMask(Number(prefix));
    return (ipInt & mask) === (baseInt & mask);
  });
}

export function ipAllowedForMode(
  ip: string,
  cidrs: string[],
  mode: NetworkAccessMode,
): boolean {
  if (mode === "public") {
    const normalized = normalizeIp(ip);
    return Boolean(normalized && isIpv4(normalized));
  }

  return ipAllowedByCidrs(ip, cidrs);
}

export function normalizeIp(ip: string): string | null {
  if (!ip) {
    return null;
  }

  if (ip === "::1") {
    return "127.0.0.1";
  }

  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }

  return ip;
}

function isIpv4(input: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(input);
}

function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  const [a, b] = octets;

  if (a === 10) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  return false;
}

function toCidr(ip: string, netmask: string): string {
  const prefix = netmask
    .split(".")
    .map((part) => Number(part).toString(2).padStart(8, "0"))
    .join("")
    .replace(/0+$/, "").length;

  const mask = prefixToMask(prefix);
  const network = intToIpv4(ipv4ToInt(ip) & mask);
  return `${network}/${prefix}`;
}

function prefixToMask(prefix: number): number {
  if (prefix <= 0) {
    return 0;
  }

  if (prefix >= 32) {
    return 0xffffffff;
  }

  return ((0xffffffff << (32 - prefix)) >>> 0);
}

function ipv4ToInt(ip: string): number {
  return ip
    .split(".")
    .map(Number)
    .reduce((acc, part) => ((acc << 8) | part) >>> 0, 0);
}

function intToIpv4(value: number): string {
  return [24, 16, 8, 0]
    .map((shift) => (value >>> shift) & 255)
    .join(".");
}
