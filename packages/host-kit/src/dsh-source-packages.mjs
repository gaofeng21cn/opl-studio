import fs from "node:fs";
import path from "node:path";

const sourceGroups = ["core", "extensions", "channels"];

/** Locate repository source packages. Installed packages use the DSH inventory. */
export function listDshSourcePackages(sourceRoot) {
  const packages = new Map();
  for (const group of sourceGroups) {
    const groupRoot = path.join(sourceRoot, "plugins", group);
    if (!fs.existsSync(groupRoot)) continue;
    for (const entry of fs.readdirSync(groupRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relativeDirectory = `plugins/${group}/${entry.name}`;
      const directory = path.join(sourceRoot, relativeDirectory);
      const manifestPath = path.join(directory, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      if (packages.has(entry.name)) throw new Error(`Duplicate DSH source package directory: ${entry.name}`);
      packages.set(entry.name, {
        id: entry.name,
        group,
        directory,
        relativeDirectory,
        manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8"))
      });
    }
  }
  return [...packages.values()].sort((left, right) => left.id.localeCompare(right.id));
}
