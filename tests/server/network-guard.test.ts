import { describe, expect, it } from "vitest";

import {
  collectAllowedCidrs,
  ipAllowedForMode,
  ipAllowedByCidrs,
} from "../../src/server/security/network-guard";

describe("network guard", () => {
  it("allows loopback and local interface subnets while blocking public addresses", () => {
    const cidrs = collectAllowedCidrs([
      { address: "127.0.0.1", netmask: "255.0.0.0", internal: true },
      { address: "192.168.3.73", netmask: "255.255.255.0", internal: false },
      { address: "172.19.0.1", netmask: "255.255.255.240", internal: false },
      { address: "8.8.8.8", netmask: "255.255.255.0", internal: false },
    ]);

    expect(ipAllowedByCidrs("127.0.0.1", cidrs)).toBe(true);
    expect(ipAllowedByCidrs("192.168.3.99", cidrs)).toBe(true);
    expect(ipAllowedByCidrs("172.19.0.14", cidrs)).toBe(true);
    expect(ipAllowedByCidrs("8.8.8.8", cidrs)).toBe(false);
    expect(ipAllowedByCidrs("91.198.174.192", cidrs)).toBe(false);
  });

  it("can explicitly allow public IPs when remote mode is enabled", () => {
    const cidrs = collectAllowedCidrs([
      { address: "192.168.3.73", netmask: "255.255.255.0", internal: false },
    ]);

    expect(ipAllowedForMode("95.161.165.122", cidrs, "private")).toBe(false);
    expect(ipAllowedForMode("95.161.165.122", cidrs, "public")).toBe(true);
  });
});
