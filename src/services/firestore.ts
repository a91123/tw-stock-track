import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { Transaction } from '../types'
import { NewsItem } from './gemini'

interface UserData {
  transactions: Transaction[]
  stockNames: Record<string, string>
}

export interface NewsCache {
  date: string                         // YYYY-MM-DD，抓取當天
  items: Record<string, NewsItem[]>    // stockCode → 新聞列表
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

export async function loadNewsCache(uid: string): Promise<NewsCache | null> {
  const ref = doc(db, 'users', uid, 'data', 'newsCache')
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return snap.data() as NewsCache
}

export async function saveNewsCache(uid: string, cache: NewsCache): Promise<void> {
  const ref = doc(db, 'users', uid, 'data', 'newsCache')
  await setDoc(ref, cache)
}
