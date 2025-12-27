// Import Firebase SDK
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBh1Hgu1QL0V-nfY3QpiejpX3aFl6_dFPw",
  authDomain: "diego-b88e8.firebaseapp.com",
  projectId: "diego-b88e8",
  storageBucket: "diego-b88e8.firebasestorage.app",
  messagingSenderId: "305721194502",
  appId: "1:305721194502:web:94f401c41ccef1733a2b87",
  measurementId: "G-YFM6YDES51"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore
const db = getFirestore(app);

// Auth
const auth = getAuth(app);

// Analytics
let analytics;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

export { db, auth, analytics };
