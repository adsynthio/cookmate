// Vercel build for the Cookmate web app (vercel.json runs this after `npm ci` in apps/mobile).
// 1. Exports the app for the web into apps/mobile/dist, against the live Supabase project. The public settings (live
//    mode, project URL, publishable anon key) come from apps/mobile/eas.json, the same ones the phone builds use; a
//    Vercel environment variable of the same name overrides them.
// 2. Fills __BASE__ in the page template and manifest (the app is served from the domain root, so it becomes "").
// 3. Adds the privacy policy and account deletion pages under /legal when the Vercel environment variables
//    SUPPORT_EMAIL and OPERATOR are set (Google Play links to them). Without both, they are left out, so a page with a
//    blank contact never goes live; the app is published either way.
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../..", import.meta.url).pathname;
const app = join(root, "apps/mobile");
const out = join(app, "dist");

const easEnv = JSON.parse(readFileSync(join(app, "eas.json"), "utf8")).build.base.env;
const env = { ...process.env };
for (const [k, v] of Object.entries(easEnv)) if (!env[k]) env[k] = v;

const email = process.env.SUPPORT_EMAIL?.trim();
const operator = process.env.OPERATOR?.trim();
// The sign-up screen links to the privacy policy only when this build publishes it.
if (email && operator) env.EXPO_PUBLIC_PRIVACY_URL = "/legal/privacy";

rmSync(out, { recursive: true, force: true });
execSync(`npx expo export --platform web --output-dir dist`, { cwd: app, env, stdio: "inherit" });

for (const name of ["index.html", "manifest.webmanifest"]) {
  const f = join(out, name);
  writeFileSync(f, readFileSync(f, "utf8").replaceAll("__BASE__", ""));
}
if (readFileSync(join(out, "index.html"), "utf8").includes("__BASE__")) throw new Error("unfilled __BASE__");

if (email && operator) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const legal = join(out, "legal");
  mkdirSync(legal, { recursive: true });
  for (const f of readdirSync(join(root, "site"))) {
    const src = join(root, "site", f);
    if (!f.endsWith(".html")) { cpSync(src, join(legal, f)); continue; }
    const html = readFileSync(src, "utf8").replaceAll("{{SUPPORT_EMAIL}}", esc(email)).replaceAll("{{OPERATOR}}", esc(operator));
    if (html.includes("{{")) throw new Error(`unfilled placeholder in site/${f}`);
    writeFileSync(join(legal, f), html);
  }
  console.log("Added /legal pages (privacy policy, account deletion).");
} else {
  console.log("SUPPORT_EMAIL and OPERATOR are not set: the /legal pages are left out. The app is published.");
}
if (!existsSync(join(out, "index.html"))) throw new Error("no index.html in the export");
console.log("Cookmate web app built in apps/mobile/dist");
