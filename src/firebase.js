// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import {getAuth, GoogleAuthProvider} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA4D_H_CfHNtPfXRoiDRzs48R9DuXL-BmE",
  authDomain: "canteen-app-7287b.firebaseapp.com",
  projectId: "canteen-app-7287b",
  storageBucket: "canteen-app-7287b.firebasestorage.app",
  messagingSenderId: "743686684642",
  appId: "1:743686684642:web:d0c0e876f13310686883bb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth=getAuth(app);
const provider=new GoogleAuthProvider();
const db=getFirestore(app);
export {auth,provider,db};