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
console.log('root collections:', collections.map((c) => c.id));

// users collection itself might be empty (ghost docs) but have subcollections.
// Try a few likely subcollection names via collectionGroup.
const guesses = ['transactions', 'portfolios', 'holdings', 'users', 'stocks', 'settings'];
for (const name of guesses) {
  try {
    const snap = await db.collectionGroup(name).limit(3).get();
    console.log(`\n=== collectionGroup(${name}) : ${snap.size} 筆 (取樣) ===`);
    snap.docs.forEach((doc) => {
      console.log(`- path=${doc.ref.path}`);
      console.log(`  data=${JSON.stringify(doc.data()).slice(0, 300)}`);
    });
  } catch (e) {
    console.log(`\n=== collectionGroup(${name}) 錯誤: ${e.message} ===`);
  }
}

console.log('\n=== collectionGroup(data) 全部 users/{uid}/data/main ===')
const dataSnap = await db.collectionGroup('data').get();
dataSnap.docs.forEach((doc) => {
  const d = doc.data();
  const txCount = Array.isArray(d.transactions) ? d.transactions.length : 'n/a';
  console.log(`- path=${doc.ref.path} keys=${Object.keys(d).join(',')} txCount=${txCount}`);
});
