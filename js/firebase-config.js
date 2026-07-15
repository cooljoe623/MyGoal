/* ============================================================
   FIREBASE-CONFIG.JS — your project's connection details
   ============================================================
   1. Create a free project at https://console.firebase.google.com
   2. Enable Authentication > Sign-in method > Email/Password
   3. Enable Firestore Database (Production mode is fine)
   4. Project Settings > General > "Your apps" > Add app > Web (</>)
   5. Copy the config object Firebase shows you and paste the values below.

   Full walkthrough with screenshoted steps: see SYNC_SETUP.md in this folder.

   Until you fill in a real apiKey (i.e. it no longer starts with "YOUR_"),
   the app runs exactly as it always has — fully offline, no sync, no
   account required. Nothing breaks if you skip this file entirely.
============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
