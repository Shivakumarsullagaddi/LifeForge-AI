import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = require('../firebase-applet-config.json');

const app = initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
});

const dbDefault = getFirestore(app);
let dbNamed: any;
try {
  dbNamed = getFirestore(app, 'ai-studio-lifeforgeai');
} catch (e) {
  console.log('Error initializing named db:', e);
}

async function testDb(database: any, name: string) {
  console.log(`Testing database: ${name}`);
  try {
    const snap = await getDocs(collection(database, 'users'));
    console.log(`Success on ${name}! Count: ${snap.size}`);
    for (const d of snap.docs) {
      console.log(`  User: ${d.id}`);
    }
  } catch (err: any) {
    console.log(`Failed on ${name}:`, err.message);
  }
}

async function check() {
  await testDb(dbDefault, '(default)');
  if (dbNamed) await testDb(dbNamed, 'ai-studio-lifeforgeai');
}

check().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
