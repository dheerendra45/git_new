const admin = require("firebase-admin");
const dotenv = require("dotenv");

dotenv.config();

// Parse the Firebase credentials from the single FIREBASE_CONFIG env variable
const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

// Initialize Firebase Admin SDK only if it hasn't been initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = {
  admin,
  db,
};
