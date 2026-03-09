import { access, readdir } from "node:fs/promises";
import path from "node:path";

import type { WorkspaceBrowserResponse } from "../../shared/contracts";

export async function browseWorkspace(targetPath: string): Promise<WorkspaceBrowserResponse> {
  const currentPath = path.resolve(targetPath);
  const entries = await readdir(currentPath, {
    withFileTypes: true,
  });

  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(currentPath, entry.name),
      kind: "directory" as const,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    currentPath,
    parentPath: getParentPath(currentPath),
    roots: await detectRoots(currentPath),
    entries: directories,
  };
}

async function detectRoots(currentPath: string): Promise<string[]> {
  const root = path.parse(currentPath).root;
  const roots: string[] = [];

  for (let code = 67; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    try {
      await access(drive);
      roots.push(drive);
    } catch {
      continue;
    }
  }

  if (!roots.includes(root)) {
    roots.unshift(root);
  }

  return roots;
}

function getParentPath(currentPath: string): string | null {
  const parentPath = path.dirname(currentPath);
  return parentPath === currentPath ? null : parentPath;
}
