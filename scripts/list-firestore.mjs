import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(__dirname, '.keys', 'serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const collections = await db.listCollections();

for (const col of collections) {
  const snapshot = await col.limit(1000).get();
  console.log(`\n=== ${col.id} (${snapshot.size} 筆) ===`);
  snapshot.docs.slice(0, 3).forEach((doc) => {
    console.log(`- ${doc.id}:`, JSON.stringify(doc.data()));
  });
}
