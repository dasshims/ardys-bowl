# Ardy's Bowl

A shared Mon–Fri breakfast/dinner tracker for Ardy. Static site (GitHub Pages) + Firebase Firestore for live, shared state.

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
- Data lives at `weeks/{Monday's date}/meals/{mon-am … fri-pm}`. A ticked meal is a document; un-ticking deletes it.
- Breakfast is "due" before 3pm, dinner after (`DINNER_FROM_HOUR` in `app.js`).

## Security note

Anyone who has the URL can read and tick meals (anonymous sign-in). The rules stop them writing anything other than meal ticks, but they don't stop strangers. If you want to lock it to your family, switch to Google sign-in and allow-list emails in the rules, e.g.:

```
allow read, write: if request.auth.token.email in ['you@gmail.com', 'partner@gmail.com'];
```
