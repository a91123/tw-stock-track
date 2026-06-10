/** Taiwan timezone offset in ms (UTC+8) */
const TW_OFFSET = 8 * 3600 * 1000

/** Current date string in Taiwan timezone (YYYY-MM-DD) */
export function todayTW(): string {
  return new Date(Date.now() + TW_OFFSET).toISOString().slice(0, 10)
}

/** Whether Taiwan stock market is currently in session (Mon–Fri 09:00–13:30 CST) */
export function isTradingHours(): boolean {
  const twNow = new Date(Date.now() + TW_OFFSET)
  const day = twNow.getUTCDay() // 0=Sun, 6=Sat in TW local time
  if (day === 0 || day === 6) return false
  const minutes = twNow.getUTCHours() * 60 + twNow.getUTCMinutes()
  return minutes >= 9 * 60 && minutes < 13 * 60 + 30
}
