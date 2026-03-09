import { networkInterfaces } from "node:os";

import type { ListenUrl } from "../../shared/contracts";

export function collectListenUrls(port: number): ListenUrl[] {
  const urls: ListenUrl[] = [];
  const seen = new Set<string>();

  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }

      const url = `http://${address.address}:${port}`;
      if (seen.has(url)) {
        continue;
      }

      seen.add(url);
      urls.push({
        label: labelForInterface(name, address.address),
        url,
      });
    }
  }

  urls.sort((left, right) => left.label.localeCompare(right.label));
  return urls;
}

function labelForInterface(name: string, address: string): string {
  if (address.startsWith("172.")) {
    return "VPN";
  }

  if (name.toLowerCase().includes("ethernet") || name.toLowerCase().includes("wifi")) {
    return "LAN";
  }

  return name;
}
