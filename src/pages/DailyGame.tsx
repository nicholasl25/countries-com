import { useEffect, useState } from 'react'
import { api, ApiError, type DailyGame as Daily } from '../api'
import { GuessRound, type PlayedRound } from '../components/GuessRound'
import {
  MAX_ROUND_SCORE,
  copyText,
  formatDay,
  loadProgress,
  localDate,
  saveProgress,
  scoreEmoji,
  shareText,
} from '../daily'
import { routeHref } from '../router'

export function DailyGame() {
  const [date] = useState(localDate)
  const [game, setGame] = useState<Daily | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [played, setPlayed] = useState<PlayedRound[]>(() => loadProgress(date))
  const [index, setIndex] = useState(played.length)

  function load() {
    setError(null)
    api.getDaily(date).then(setGame, (err: unknown) => {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setMissing(true)
      else setError(err instanceof Error ? err.message : 'Something went wrong.')
    })
  }

  // `date` is fixed for the life of the page.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  if (missing) {
    return (
      <div className="state rise">
        <p className="state-title">No daily game today</p>
        <p className="state-body">Today’s rounds haven’t been picked yet. Check back tomorrow.</p>
        <a className="btn" href={routeHref({ page: 'random', category: null })}>
          Play Random instead
        </a>
      </div>
    )
  }

  const rounds = game?.rounds ?? []
  const current = Math.max(0, Math.min(index, rounds.length - 1))
  const finished = game !== null && played.length >= rounds.length

  function onPlayed(round: PlayedRound) {
    const next = [...played, round]
    setPlayed(next)
    saveProgress(date, next)
  }

  return (
    <GuessRound
      key={`${date}-${current}`}
      territory={rounds[current] ?? null}
      loadError={error}
      onRetry={load}
      header={
        game && (
          <div className="daily-bar">
            <p className="daily-title">
              Daily #{game.number} · {formatDay(game.date)}
            </p>
            <ol className="daily-rounds" aria-label="Rounds">
              {rounds.map((t, i) => {
                const score = played[i]?.result.score
                const label = score === undefined ? `Round ${i + 1}` : `Round ${i + 1}: ${score} points`
                return (
                  <li key={`${i}-${t.id}`}>
                    <button
                      type="button"
                      className={`daily-round${i === current ? ' is-current' : ''}${score !== undefined ? ' is-done' : ''}`}
                      aria-label={label}
                      aria-current={i === current ? 'step' : undefined}
                      disabled={!finished}
                      onClick={() => setIndex(i)}
                    >
                      {score ?? i + 1}
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      }
      played={played[current] ?? null}
      onPlayed={onPlayed}
    >
      {game && finished ? (
        <DailySummary game={game} played={played} />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setIndex(current + 1)}>
          Next round
        </button>
      )}
    </GuessRound>
  )
}

function DailySummary({ game, played }: { game: Daily; played: PlayedRound[] }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const total = played.reduce((sum, r) => sum + r.result.score, 0)
  const url = `${window.location.origin}${window.location.pathname}${routeHref({ page: 'daily' })}`
  const text = shareText(game, played, url)

  async function copy() {
    const ok = await copyText(text)
    setCopied(ok)
    if (ok) window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="daily-summary">
      <p className="score">
        <span className="score-value">{total.toLocaleString('en-US')}</span>
        <span className="score-label">
          / {(game.rounds.length * MAX_ROUND_SCORE).toLocaleString('en-US')} total
        </span>
      </p>
      <ol className="daily-breakdown">
        {played.map((r, i) => (
          <li key={`${i}-${game.rounds[i].id}`}>
            <span aria-hidden="true">{scoreEmoji(r.result.score)}</span>
            <span className="daily-breakdown-name">{game.rounds[i].name}</span>
            <span className="daily-breakdown-score">{r.result.score}</span>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-primary" onClick={copy}>
        {copied ? 'Copied!' : 'Copy score'}
      </button>
      {copied === false && (
        <>
          <p className="hint" role="alert">
            Couldn’t copy automatically. Copy it from here:
          </p>
          <textarea
            className="daily-share"
            readOnly
            rows={4}
            value={text}
            ref={(el) => el?.select()}
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      )}
      <p className="daily-next">New rounds tomorrow.</p>
    </div>
  )
}
