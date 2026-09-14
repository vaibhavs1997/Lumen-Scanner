#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function findTests(directory, suffix) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...findTests(path, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(path);
  }
  return found.sort();
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const scriptTests = findTests(join(projectRoot, "scripts"), ".test.mjs");
const sourceTests = findTests(join(projectRoot, "src"), ".test.ts");

if (scriptTests.length === 0 || sourceTests.length === 0) {
  throw new Error(
    `Test discovery failed: found ${scriptTests.length} script tests and ${sourceTests.length} source tests.`,
  );
}

let status = run(["--test", ...scriptTests]);
if (status === 0) {
  status = run(["--experimental-strip-types", "--test", ...sourceTests]);
}
process.exitCode = status;
