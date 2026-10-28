# Ardy's Bowl

A shared daily (Mon–Sun) breakfast/dinner tracker for Ardy. Static site (GitHub Pages) + Firebase Firestore for live, shared state.

## Files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The site |
| `firebase-config.js` | Your Firebase web config (fill this in) |
| `firestore.rules` | Database security rules (paste into Firebase) |
| `manifest.webmanifest`, `icon.svg` | "Add to Home Screen" support |

## One-time Firebase setup (free Spark plan)

1. Go to https://console.firebase.google.com → **Add project** (Analytics not needed).
2. **Build → Firestore Database → Create database** → production mode → pick a region.
3. **Firestore → Rules** → replace with the contents of `firestore.rules` → **Publish**.
4. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable**.
5. **Authentication → Settings → Authorized domains** → add `<your-username>.github.io`.
6. **Project settings (gear) → Your apps → Web (`</>`)** → register an app → copy the `firebaseConfig` object into `firebase-config.js`.

## Run locally

ES modules need a server (not `file://`):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

`localhost` is an authorized domain by default.

## Deploy to GitHub Pages

Push these files to a repo, then **Settings → Pages → Deploy from a branch → `main` / root**. The site appears at `https://<your-username>.github.io/<repo>/`.

## How it works

- Each person enters their name once (stored in their browser). It's shown next to the meals they tick.
- Data lives at `weeks/{Monday's date}/meals/{mon-am … sun-pm}`. A ticked meal is a document; un-ticking deletes it.
- After anonymous sign-in, each app load tries to ask ipify for the public IP address and adds an `accessLogs` document with the address when available, plus the anonymous Firebase UID, server timestamp, browser user-agent, language, and time zone. If the IP lookup fails, it still records the visit without an IP. It does not collect the selected name. The app cannot read these logs; the Firebase project owner can view and delete them in the Firebase console. Logs have no automatic expiration.
- Breakfast is "due" before 3pm, dinner after (`DINNER_FROM_HOUR` in `app.js`).

## Access-log architecture decision

For this family-only app, access logging uses a client-side HTTPS request to `https://api.ipify.org?format=json`, then writes the returned IP to Firestore. This avoids adding a server function and billing setup. Every visitor's public IP is disclosed to ipify, and the IP is stored in this project's Firestore database when the lookup succeeds. If the lookup fails, the app logs the visit without an IP and continues operating. The IP lookup is best-effort, not a trustworthy security audit: visitors can alter client-side code or submit a different address. Use a server-side endpoint if reliable IP attribution becomes important. Access logs currently have no automatic retention or deletion policy.

## Security note

Anyone who has the URL can read and change meals (anonymous sign-in). Authenticated clients can also create access-log entries, but cannot read, update, or delete those logs through the app. These rules do not stop strangers from using the app or spoofing the client-reported IP. If you want to lock it to your family, switch to Google sign-in and allow-list emails in the rules, e.g.:

```
allow read, write: if request.auth.token.email in ['you@gmail.com', 'partner@gmail.com'];
```
