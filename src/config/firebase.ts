import * as admin from 'firebase-admin';
import { config } from './env';

let firebaseApp: admin.app.App | null = null;

try {
  if (config.firebase.projectId && config.firebase.clientEmail && config.firebase.privateKey) {
    const formattedPrivateKey = config.firebase.privateKey.replace(/\\n/g, '\n');
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: formattedPrivateKey,
      }),
    });
    console.log('Firebase Admin SDK initialized successfully');
  } else {
    console.warn('Firebase credentials not fully set in environment variables. FCM disabled.');
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK:', error);
}

export default firebaseApp;
