# Sign-in: email and a 6-digit code

Cooks make an account and log in with their email address. Cookmate emails a 6-digit code and the cook types it into
the app. There are no passwords and no links to click: on an iPhone a link in an email opens Safari, whose storage is
separate from the installed web app, so the cook would end up signed in somewhere else. A typed code works the same in
every build.

## How it works

| Step | What happens | Code |
|---|---|---|
| Welcome | "Create my account" or "I already have an account". Both lead to the same two steps; only the words differ | `apps/mobile/src/app/onboarding/index.tsx` |
| Email | `signInWithOtp({ email, shouldCreateUser: true })`. A new email gets a new account (Supabase sends the "Confirm sign up" email); a known one gets the "Magic link" email. Both carry the code | `components/auth/EmailStep.tsx`, `services/live.ts` |
| Code | Six boxes; the sixth digit checks it with `verifyOtp({ type: "email" })`. Wrong or expired codes shake the boxes and say so; a new code can be sent after 60 seconds | `components/auth/CodeStep.tsx` |
| After | An account with a kitchen opens Home (its language too). A new account goes on to set up the kitchen (who eats here, kitchen, taste, consent) | `CodeStep.tsx` → `useFinish` |
| Log out | You → Your account → Log out. Only this device is signed out; the kitchen stays on the account, and logging in again brings it back. Queued offline edits are sent first, then nothing of the account stays on the phone | `app/(tabs)/you.tsx` → `AccountSection` |

Kitchens made before email sign-in belong to anonymous accounts that live on one phone. You shows them a "Your kitchen
is only on this phone" card; **Save with email** adds the email to that same account (`updateUser({ email })`, then
`verifyOtp({ type: "email_change" })`), so the user id and every row stay exactly where they are. If the email
already has an account, the cook is told to log out and log in with it instead.

The preview build (`EXPO_PUBLIC_USE_MOCKS=1`) takes any email and the code **123456**; an address ending in
`@blocked.test` shows the "can't send to this address yet" answer.

## The emails

`supabase/templates/` holds the three emails that carry a code: `magic_link.html` (log in), `confirmation.html` (new
account) and `email_change.html` (save an anonymous kitchen with an email). Each shows the code large, with a line in
Hindi and Kannada, and no link. The subject is "123456 is your Cookmate code", so the code shows in the inbox list.

Pushing a change to them on main runs `.github/workflows/auth-config.yml`, which puts them on the hosted project's
Auth config through the Management API (`tools/supabase/auth-config.mjs`, with the `SUPABASE_ACCESS_TOKEN`
repository secret) together with a 6-digit code that works for one hour, then reads the config back and prints it.
It can also be run by hand from the Actions tab. CI checks that every template has `{{ .Token }}` and no link. On
the free plan the emails only change once custom SMTP is on (below); the 6-digit code setting applies either way.

## Sending the emails: switch on an email provider

**Status (21 Nov 2026):** custom SMTP through a Gmail account is on, and the Cookmate code emails are live (Supabase
allows 30 emails an hour with custom SMTP; raise it under Authentication → Rate Limits when testers grow).

Out of the box, Supabase sends these emails itself, with three limits that matter:

- It only sends to the email addresses of your Supabase organization's team members. Anyone else gets "We can't send
  email to this address yet" in the app.
- Only 2 emails an hour for the whole project.
- On the free plan, the project's emails can't be changed while Supabase's own sender is on, so Cookmate's code emails
  above stay waiting and Supabase's default emails go out instead. The workflow still sets 6-digit codes and says so in
  a warning.

Supabase's default emails carry a sign-in link, not a code. The workflow points that link at the web app (`SITE_URL`),
and the web app picks up a session from it, so until custom SMTP is on, opening the link in a browser signs that browser
in (on an iPhone that's Safari, not the installed app).

So custom SMTP is the switch that turns this on properly (Supabase dashboard → Authentication → Emails → SMTP Settings
→ Enable custom SMTP). After saving it, run **Actions → Auth email settings → Run workflow** once: the Cookmate code
emails go live and the run prints "Sign-in emails are live."

**Now, with no domain of your own: a Gmail account.** Free, up to about 500 emails a day.

1. Make a Gmail account just for Cookmate (for example `cookmate.codes@gmail.com`), so your own inbox stays separate.
2. In that account turn on 2-Step Verification, then create an App password (Google Account → Security → App passwords).
3. In Supabase SMTP Settings: sender email = that Gmail address, sender name = `Cookmate`, host = `smtp.gmail.com`,
   port = `587`, username = the Gmail address, password = the App password. Save.
4. Authentication → Rate Limits → "Rate limit for sending emails": raise it to 100 an hour.

**Later, with a domain (about ₹800–1,000 a year):** Resend's free plan (3,000 emails a month, 100 a day). Add the
domain in Resend, put its DNS records at your domain registrar, then in Supabase: host `smtp.resend.com`, port `465`,
username `resend`, password = a Resend API key, sender = `codes@yourdomain`. Mail from your own domain is less likely
to land in spam.

Whichever you choose, add it to the privacy policy's table of processors (`site/privacy.html`) and keep the Data
safety form in step (`docs/play/DATA_SAFETY.md`).

## Trying it

1. Open the app signed out (or log out from You), tap **Create my account**, type your own email (the one on your
   Supabase team while the built-in sender is on).
2. The email arrives within a minute with the subject "123456 is your Cookmate code". Type the code: the sixth digit
   signs you in and setup starts.
3. Log out from You, then **I already have an account** with the same email: Home opens on the same kitchen.

## Google Play review

With sign-in required, Play's App access form needs a way for reviewers to get in, and they can't read a code sent to
an inbox they don't have. Before the first review, add a review login: an account with a password that only the review
team gets (Supabase can create one: Authentication → Users → Add user), and a small "Log in with password" path for it.
Until then, answer App access as described in `docs/play/APP_CONTENT.md`.
