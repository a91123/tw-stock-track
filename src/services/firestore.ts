import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { Transaction } from '../types'
import { NewsItem } from './gemini'

export interface PriceAlert {
  target?: number   // 目標價
  stopLoss?: number // 停損價
}

// 分割/合股調整紀錄：套用一次就記一筆，用來防止同一個日期被重複套用而疊加股數
export interface AppliedSplit {
  splitDate: string
  ratio: number
  appliedAt: string // ISO timestamp
}

interface UserData {
  transactions: Transaction[]
  stockNames: Record<string, string>
  priceAlerts?: Record<string, PriceAlert>
  appliedSplits?: Record<string, AppliedSplit[]>
}

export interface NewsCache {
  fetchedAt: number                    // Unix timestamp ms
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
  // JSON round-trip strips undefined fields (Firestore rejects undefined values)
  await setDoc(ref, JSON.parse(JSON.stringify(data)))
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
