/* ============================================================
   SYNC.JS — Firebase email/password auth + Firestore sync
   ============================================================
   This module is entirely optional: if js/firebase-config.js still has
   placeholder values (no real project configured), every function here
   becomes a safe no-op and the app behaves exactly as it does offline-only.
   See SYNC_SETUP.md for how to connect a real Firebase project.
============================================================ */

const Sync = (() => {
  let auth = null;
  let db = null;
  let currentUser = null;
  let unsubscribeSnapshot = null;
  let pushTimer = null;
  let lastPushedAt = null;
  let configured = false;
  let ready = false; // becomes true once firebase.initializeApp has run

  function isConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined' &&
      FIREBASE_CONFIG.apiKey && !String(FIREBASE_CONFIG.apiKey).startsWith('YOUR_');
  }

  function init() {
    configured = isConfigured();
    if (!configured) return;
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK did not load (offline on first load, or CDN blocked) — sync unavailable this session.');
      configured = false;
      return;
    }
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      ready = true;
      auth.onAuthStateChanged(handleAuthChange);
    } catch (err) {
      console.error('Firebase init failed', err);
      configured = false;
    }
  }

  function handleAuthChange(user) {
    currentUser = user;
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
    if (user) {
      pullAndMerge().then((result) => {
        subscribeRealtime();
        if (typeof App !== 'undefined' && App.onSyncSignedIn) App.onSyncSignedIn(user, result);
      });
    } else if (typeof App !== 'undefined' && App.onSyncSignedOut) {
      App.onSyncSignedOut();
    }
  }

  function friendlyAuthError(err) {
    const map = {
      'auth/email-already-in-use': 'That email is already registered — try signing in instead.',
      'auth/invalid-email': 'That email address looks invalid.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/user-not-found': 'No account found with that email.',
      'auth/too-many-requests': 'Too many attempts — wait a moment and try again.',
      'auth/network-request-failed': 'Network error — check your connection.',
      'auth/invalid-credential': 'Incorrect email or password.'
    };
    return map[err && err.code] || (err && err.message) || 'Something went wrong.';
  }

  async function signUp(email, password) {
    if (!ready) throw new Error('Sync is not configured yet — see SYNC_SETUP.md.');
    try {
      await auth.createUserWithEmailAndPassword(email, password);
    } catch (err) {
      throw new Error(friendlyAuthError(err));
    }
  }

  async function signIn(email, password) {
    if (!ready) throw new Error('Sync is not configured yet — see SYNC_SETUP.md.');
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      throw new Error(friendlyAuthError(err));
    }
  }

  async function signOutUser() {
    if (!ready) return;
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
    await auth.signOut();
  }

  async function resetPassword(email) {
    if (!ready) throw new Error('Sync is not configured yet — see SYNC_SETUP.md.');
    try {
      await auth.sendPasswordResetEmail(email);
    } catch (err) {
      throw new Error(friendlyAuthError(err));
    }
  }

  /** Permanently deletes this account's cloud data AND the Firebase Auth
   *  user itself. Requires being signed in — Firebase won't allow deleting
   *  an arbitrary account without recent authentication, which is why this
   *  can only be offered from Settings (post sign-in), not from the sign-in
   *  gate. Local data is NOT wiped here — the caller (app.js) handles that
   *  separately so it can also cover the "not signed in" / local-only case. */
  async function deleteAccount() {
    if (!ready || !currentUser) throw new Error('Not signed in.');
    const uid = currentUser.uid;
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
    try {
      await db.collection('users').doc(uid).delete();
    } catch (err) {
      console.error('Could not delete cloud data before account deletion', err);
      // Non-fatal — still attempt to delete the auth account itself below.
    }
    try {
      await currentUser.delete();
    } catch (err) {
      if (err && err.code === 'auth/requires-recent-login') {
        throw new Error('For security, deleting your account requires a recent sign-in. Sign out, sign back in, then try again.');
      }
      throw new Error(friendlyAuthError(err));
    }
  }

  function docRef() {
    return db.collection('users').doc(currentUser.uid);
  }

  /** Pull the cloud copy once and merge it into local data (called right after sign-in). */
  async function pullAndMerge() {
    if (!currentUser) return null;
    try {
      const snap = await docRef().get();
      if (!snap.exists) {
        await pushNow(); // first sync ever for this account — seed the cloud from this device
        return { addedGoals: 0, updatedGoals: 0, addedEntries: 0, updatedEntries: 0, firstSync: true };
      }
      return Storage.mergeRemoteBackup(snap.data());
    } catch (err) {
      console.error('Initial sync pull failed', err);
      if (typeof App !== 'undefined' && App.onSyncError) App.onSyncError(err);
      return null;
    }
  }

  /** Live-listen for changes pushed from other signed-in devices. */
  function subscribeRealtime() {
    if (!currentUser) return;
    unsubscribeSnapshot = docRef().onSnapshot({ includeMetadataChanges: true }, (snap) => {
      if (snap.metadata.hasPendingWrites) return; // our own write echoing back — ignore
      const remote = snap.data();
      if (!remote || remote.updatedAt === lastPushedAt) return;
      const result = Storage.mergeRemoteBackup(remote);
      if (result && (result.addedGoals || result.updatedGoals || result.addedEntries || result.updatedEntries)) {
        if (typeof App !== 'undefined' && App.onSyncRemoteUpdate) App.onSyncRemoteUpdate(result);
      }
    }, (err) => {
      console.error('Sync listener error', err);
      if (typeof App !== 'undefined' && App.onSyncError) App.onSyncError(err);
    });
  }

  /** Debounced push — call this after any local data mutation. Safe no-op if signed out. */
  function scheduleSync() {
    if (!configured || !currentUser) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 2500);
  }

  async function pushNow() {
    if (!configured || !currentUser) return;
    const data = Storage.exportBackup();
    data.updatedAt = new Date().toISOString();
    lastPushedAt = data.updatedAt;
    try {
      await docRef().set(data);
      if (typeof App !== 'undefined' && App.onSyncPushed) App.onSyncPushed(data.updatedAt);
    } catch (err) {
      console.error('Sync push failed', err);
      if (typeof App !== 'undefined' && App.onSyncError) App.onSyncError(err);
    }
  }

  function isSignedIn() { return !!currentUser; }
  function currentEmail() { return currentUser ? currentUser.email : null; }

  return {
    init, isConfigured, signUp, signIn, signOutUser, resetPassword, deleteAccount,
    scheduleSync, pushNow, pullAndMerge, isSignedIn, currentEmail
  };
})();
