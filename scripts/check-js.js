import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const ignored = new Set([".git", "node_modules", "data"]);
const files = [];

collect(repoRoot);

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} JavaScript files.`);
}

function collect(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignored.has(entry)) continue;
    const fullPath = path.join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collect(fullPath);
      continue;
    }
    if (entry.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}
