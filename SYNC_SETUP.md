# Setting Up Cloud Sync

By default this app is 100% offline/local — nothing leaves your device. This
guide connects it to your own free Firebase project so your data syncs
between your phone, laptop, or any device where you sign in with the same
email/password.

**Cost:** free. Firebase's free tier (Spark plan) covers a personal app like
this many times over — you're not going to hit a paywall doing daily entries
for a savings goal.

**Time:** about 5–10 minutes, no coding required.

---

## 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project**, give it any name (e.g. "goal-tracker"), and click through the setup (you can disable Google Analytics — not needed).
3. Wait for it to finish provisioning, then click **Continue**.

## 2. Turn on Email/Password sign-in

1. In the left sidebar, go to **Build → Authentication**.
2. Click **Get started**.
3. Click **Email/Password** in the provider list, toggle it **Enabled**, and click **Save**.

## 3. Create a Firestore database

1. In the left sidebar, go to **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Start in production mode** (more secure default), pick any region close to you, and click **Enable**.

## 4. Lock down the security rules

By default, production mode blocks all access — you need to explicitly allow
each signed-in user to read/write only their own data.

1. In Firestore Database, click the **Rules** tab.
2. Replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Click **Publish**.

This means: a signed-in user can only ever read or write the document at
`users/{their own uid}` — never anyone else's data, and never anything if
they're not signed in.

## 5. Get your web app config

1. Click the gear icon next to **Project Overview** (top left) → **Project settings**.
2. Scroll to **Your apps**, click the **</>** (web) icon to add a web app.
3. Give it any nickname, click **Register app** (you can skip the Firebase Hosting offer).
4. Firebase shows you a `firebaseConfig` object like:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "goal-tracker-xxxxx.firebaseapp.com",
  projectId: "goal-tracker-xxxxx",
  storageBucket: "goal-tracker-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

5. Copy those six values into **`js/firebase-config.js`** in this app, replacing the `YOUR_...` placeholders.

## 6. Authorize your domain

Wherever you end up hosting the app (Netlify, GitHub Pages, etc.), Firebase
needs to know that domain is allowed to use this project's auth:

1. Authentication → **Settings** tab → **Authorized domains**.
2. Click **Add domain** and enter your site's domain (e.g. `yourname.netlify.app` or `yourname.github.io`).
3. `localhost` is already allowed by default, so testing locally works without this step.

## 7. Test it

1. Open the app (locally or on your hosted domain).
2. As soon as `js/firebase-config.js` has real values, the app now shows a
   full-screen sign-in gate on load instead of going straight to the
   dashboard — this is intentional: once sync is configured, an account is
   required to see anything, rather than sync being an optional extra
   buried in Settings.
3. Create an account with an email/password on the gate — the app unlocks
   and that device is now synced.
4. Open the same URL on a second device (or a private/incognito window) and
   sign in with the same account on the gate — your goals and entries
   should appear within a couple of seconds.
5. Settings → **Cloud Sync** shows the same sign-in status and a manual
   "Sync Now" button if you ever want to force a sync outside the automatic
   background one.

---

## How the sync actually works (so you know what to expect)

- Each device keeps working instantly from its own local copy — sync happens
  in the background, not in the critical path of saving an entry.
- Every local change is pushed to the cloud a couple of seconds after you
  make it (debounced, so rapid edits don't spam the network).
- Other signed-in devices get changes pushed to them in near-real-time while
  they're open.
- If the same entry (same goal + date) gets edited on two devices before
  they've synced with each other, **whichever edit has the newer timestamp
  wins** when they do sync — this is standard "last-write-wins" behavior.
- **Deletions are the one rough edge**: there's no delete-log/tombstone
  system, so if you delete an entry or reset a goal on Device A while
  Device B has been offline since before that deletion, Device B could
  resurrect the deleted data next time it syncs. For a personal app used by
  one person across their own devices, mostly online, this is unlikely to
  bite you — but it's worth knowing rather than assuming sync is bulletproof.
- `theme` (dark/light) and which goal is "active" are kept **per-device**,
  not synced — so you can have your phone showing one goal while your laptop
  shows another, without them fighting over it.
