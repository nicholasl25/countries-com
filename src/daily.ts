import type { DailyGame } from './api'
import type { PlayedRound } from './components/GuessRound'

export const MAX_ROUND_SCORE = 1000

/** Today in the player's time zone, as YYYY-MM-DD. */
export function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** e.g. "Nov 2" */
export function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function scoreEmoji(score: number): string {
  if (score >= 950) return '🎯'
  if (score >= 750) return '🟩'
  if (score >= 500) return '🟨'
  if (score >= 250) return '🟧'
  return '🟥'
}

/** Spoiler-free summary for pasting into messages. */
export function shareText(game: DailyGame, played: PlayedRound[], url: string): string {
  const scores = played.map((r) => r.result.score)
  const total = scores.reduce((sum, s) => sum + s, 0)
  return [
    `Countries.CoM Daily #${game.number} · ${formatDay(game.date)}`,
    scores.map((s) => `${scoreEmoji(s)} ${s}`).join('  '),
    `Total: ${total.toLocaleString('en-US')} / ${(game.rounds.length * MAX_ROUND_SCORE).toLocaleString('en-US')}`,
    url,
  ].join('\n')
}

const STORAGE_KEY = 'countries-com:daily'

type SavedProgress = { date: string; played: PlayedRound[] }

/** Rounds already played on `date`, so a reload doesn't reset (or replay) the day. */
export function loadProgress(date: string): PlayedRound[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SavedProgress | null
    if (saved?.date !== date) return []
    // Saves from before heat maps had one grid per part can't be drawn.
    return saved.played.every((r) => Array.isArray(r.result.density)) ? saved.played : []
  } catch {
    return []
  }
}

/** Only the current day is kept. */
export function saveProgress(date: string, played: PlayedRound[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date, played } satisfies SavedProgress))
  } catch {
    // Storage full or disabled: progress just won't survive a reload.
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // The Clipboard API needs a secure context (e.g. not http://<LAN IP>).
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}
