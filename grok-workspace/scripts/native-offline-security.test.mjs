import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("native HTML denies network connections and has no remote resources", () => {
  const html = readFileSync(join(root, "native", "index.html"), "utf8");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("web and native builds use packaged fonts instead of Google Fonts", () => {
  const rootRoute = readFileSync(join(root, "src", "routes", "__root.tsx"), "utf8");
  const styles = readFileSync(join(root, "src", "styles.css"), "utf8");
  assert.doesNotMatch(rootRoute, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(styles, /@fontsource-variable\/fraunces/);
  assert.match(styles, /@fontsource-variable\/plus-jakarta-sans/);
});

test("Android manifest requests no network permissions", () => {
  const manifest = readFileSync(
    join(root, "android", "app", "src", "main", "AndroidManifest.xml"),
    "utf8",
  );
  assert.doesNotMatch(manifest, /android\.permission\.(?:INTERNET|ACCESS_NETWORK_STATE)/);
});

test("Android builds and targets API level 36", () => {
  const buildScript = readFileSync(join(root, "android", "app", "build.gradle"), "utf8");
  assert.match(buildScript, /^\s*compileSdk\s*=\s*36\s*$/m);
  assert.match(buildScript, /^\s*targetSdk\s*=\s*36\s*$/m);
});

test("Android WebView blocks requests outside the packaged app origin", () => {
  const activity = readFileSync(
    join(root, "android", "app", "src", "main", "java", "app", "lumen", "scanner", "MainActivity.java"),
    "utf8",
  );
  assert.match(activity, /return !isTrustedAppUri\(request\.getUrl\(\)\)/);
  assert.match(activity, /return blockedWebResponse\(\)/);
});
