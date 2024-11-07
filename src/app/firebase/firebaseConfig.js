// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBvQkvm37cXoipHmcYgIRGGQXmpt6kEZTM",
    authDomain: "dnd-app-9609f.firebaseapp.com",
    projectId: "dnd-app-9609f",
    storageBucket: "dnd-app-9609f.appspot.com",
    messagingSenderId: "534001515274",
    appId: "1:534001515274:web:b956916119a9a60933d8f3",
    measurementId: "G-1BNMHY4K3Y"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
const analytics = getAnalytics(app);