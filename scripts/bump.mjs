#!/usr/bin/env node
// Bumps the app version everywhere the updater cares about, then prints the
// three git commands that ship it. Usage: pnpm bump 0.2.0
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: pnpm bump <major.minor.patch>   e.g. pnpm bump 0.2.0");
  process.exit(1);
}

for (const path of ["package.json", "src-tauri/tauri.conf.json"]) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`${path} → ${version}`);
}

console.log(`
Now ship it:
  git add -A && git commit -m "v${version}"
  git tag v${version}
  git push && git push --tags

The Release workflow builds, signs, and publishes; installed apps see it on
their next launch.`);
