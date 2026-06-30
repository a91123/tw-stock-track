import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { Transaction } from '../types'

interface UserData {
  transactions: Transaction[]
  stockNames: Record<string, string>
}

export async function loadUserData(uid: string): Promise<UserData | null> {
  const ref = doc(db, 'users', uid, 'data', 'main')
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return snap.data() as UserData
}

export async function saveUserData(uid: string, data: UserData): Promise<void> {
  const ref = doc(db, 'users', uid, 'data', 'main')
  await setDoc(ref, data)
}
