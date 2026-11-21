// Puts the sign-in email settings on the hosted Supabase project (Auth config, through the Management API):
// the three emails that carry a sign-in code (supabase/templates: magic_link for logging in, confirmation for a new
// account, email_change for saving an anonymous kitchen with an email), their subject, and a 6-digit code that works
// for one hour. Run by .github/workflows/auth-config.yml when any of them change on main.
//
//   node tools/supabase/auth-config.mjs           apply, then read back and print what the project now has
//   node tools/supabase/auth-config.mjs --check   only check the templates (CI); no network
//
// Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF for apply. Never prints secrets (SMTP password, keys).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../..", import.meta.url).pathname;
const SUBJECT = "{{ .Token }} is your Cookmate code";
const KINDS = ["magic_link", "confirmation", "email_change"];
const OTP_LENGTH = 6; // the app's code boxes (apps/mobile/src/domain/emailAuth.ts CODE_LENGTH)
const OTP_EXPIRY_S = 3600; // the emails say "It works for one hour"

export function templates() {
  return Object.fromEntries(KINDS.map((k) => [k, readFileSync(join(root, "supabase/templates", `${k}.html`), "utf8")]));
}

/** Problems with a template, as sentences. Empty when it can go live. */
export function problems(kind, html) {
  const out = [];
  if (!html.includes("{{ .Token }}")) out.push(`${kind}: no {{ .Token }}, so the cook gets no code to type`);
  if (/ConfirmationURL|TokenHash/.test(html)) out.push(`${kind}: has a sign-in link; the app signs in with the typed code only`);
  if (/<script/i.test(html)) out.push(`${kind}: has a script`);
  if (html.length > 20000) out.push(`${kind}: longer than 20 kB`);
  if (/\{[a-z_]+\}/.test(html.replace(/\{\{[^}]*\}\}/g, ""))) out.push(`${kind}: has an unfilled {placeholder}`);
  return out;
}

const SHOW = [
  "site_url",
  "external_email_enabled",
  "external_anonymous_users_enabled",
  "mailer_autoconfirm",
  "mailer_otp_length",
  "mailer_otp_exp",
  "mailer_secure_email_change_enabled",
  "smtp_max_frequency",
  "rate_limit_email_sent",
  "smtp_sender_name",
];

function summary(cfg, html) {
  const lines = SHOW.map((k) => `  ${k}: ${JSON.stringify(cfg[k])}`);
  lines.push(`  custom SMTP: ${cfg.smtp_host ? `yes (${cfg.smtp_host})` : "no, Supabase's built-in sender (team addresses only, a few emails an hour)"}`);
  for (const k of KINDS) {
    const same = cfg[`mailer_templates_${k}_content`] === html[k] && cfg[`mailer_subjects_${k}`] === SUBJECT;
    lines.push(`  ${k} email: ${same ? "Cookmate code email" : "something else"}`);
  }
  return lines.join("\n");
}

async function main() {
  const html = templates();
  const found = KINDS.flatMap((k) => problems(k, html[k]));
  if (found.length) {
    console.error(found.join("\n"));
    process.exit(1);
  }
  if (process.argv.includes("--check")) {
    console.log(`Templates OK: ${KINDS.join(", ")}`);
    return;
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token || !ref) throw new Error("Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF");
  const url = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const get = async () => {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`GET auth config: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };

  console.log("Before:\n" + summary(await get(), html));
  const body = {
    external_email_enabled: true,
    mailer_otp_length: OTP_LENGTH,
    mailer_otp_exp: OTP_EXPIRY_S,
    ...Object.fromEntries(KINDS.flatMap((k) => [[`mailer_subjects_${k}`, SUBJECT], [`mailer_templates_${k}_content`, html[k]]])),
  };
  const r = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH auth config: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  const after = await get();
  console.log("After:\n" + summary(after, html));
  const wrong = [
    after.mailer_otp_length !== OTP_LENGTH && "code length",
    after.mailer_otp_exp !== OTP_EXPIRY_S && "code expiry",
    ...KINDS.filter((k) => after[`mailer_templates_${k}_content`] !== html[k]).map((k) => `${k} email`),
  ].filter(Boolean);
  if (wrong.length) throw new Error(`Not applied: ${wrong.join(", ")}`);
  console.log("Sign-in emails are live.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
