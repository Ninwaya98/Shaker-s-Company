// Firebase Configuration — replace with your actual project credentials
// Get these from Firebase Console → Project Settings → General → Your Apps
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBV3KD5Hsd06PAkRxHoRcVKSM5TFUfD4ec",
  authDomain: "shaker-s-dishdasha.firebaseapp.com",
  projectId: "shaker-s-dishdasha",
  storageBucket: "shaker-s-dishdasha.firebasestorage.app",
  messagingSenderId: "290208982832",
  appId: "1:290208982832:web:2d1aa4f29c1f5e99244af5"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
