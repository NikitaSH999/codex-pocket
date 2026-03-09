import { describe, expect, it } from "vitest";

import {
  pickPreferredPrivateIpv4,
  type HostAddressCandidate,
} from "../../src/server/network/port-mapper";

describe("port mapper", () => {
  it("prefers a 192.168.x.x address when several private ipv4 candidates exist", () => {
    const internalHost = pickPreferredPrivateIpv4([
      {
        address: "127.0.0.1",
        family: "IPv4",
        internal: true,
      },
      {
        address: "172.19.0.10",
        family: "IPv4",
        internal: false,
      },
      {
        address: "192.168.3.73",
        family: "IPv4",
        internal: false,
      },
    ] satisfies HostAddressCandidate[]);

    expect(internalHost).toBe("192.168.3.73");
  });

  it("returns null when no private ipv4 address is available", () => {
    const internalHost = pickPreferredPrivateIpv4([
      {
        address: "127.0.0.1",
        family: "IPv4",
        internal: true,
      },
      {
        address: "2001:db8::1",
        family: "IPv6",
        internal: false,
      },
      {
        address: "8.8.8.8",
        family: "IPv4",
        internal: false,
      },
    ] satisfies HostAddressCandidate[]);

    expect(internalHost).toBeNull();
  });
});
