/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Configuration loaded from firebase-applet-config.json
const firebaseConfig = {
  projectId: "ace-terminus-4x6pd",
  appId: "1:660385551381:web:ea23ffc7bac1ef3ac86a1c",
  apiKey: "AIzaSyD1llSj3pkwO_q4r3m6yufAwmcw2QpSi3U",
  authDomain: "ace-terminus-4x6pd.firebaseapp.com",
  storageBucket: "ace-terminus-4x6pd.firebasestorage.app",
  messagingSenderId: "660385551381"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
// In AI Studio, the database ID is custom, so we must specify it
export const db = getFirestore(app, "ai-studio-expensetracker-25a0ccb2-1813-4b59-89a0-5fdc71f3eb70");

export default app;
