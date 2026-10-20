import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type ActivityStatus = 'started' | 'succeeded' | 'failed'

export interface SessionRecord {
  id: string
  host: string
  port: number
  username: string
  auth: string
  requestedVersion: string | null
  resolvedVersion: string | null
  status: 'connecting' | 'connected' | 'ended' | 'failed'
  startedAt: string
  connectedAt: string | null
  endedAt: string | null
  reason: string | null
}

export interface ActivityRecord {
  id: string
  sessionId: string | null
  at: string
  completedAt: string | null
  kind: 'action' | 'event' | 'system'
  name: string
  status: ActivityStatus
  durationMs: number | null
  input: unknown
  output: unknown
  error: string | null
}

export interface CaptureRecord {
  id: string
  sessionId: string | null
  at: string
  filename: string
  mimeType: 'image/png'
  width: number
  height: number
  radius: number
  center: { x: number, y: number, z: number }
  size: number
}

type JournalEntry =
  | { type: 'session', value: SessionRecord }
  | { type: 'activity', value: ActivityRecord }
  | { type: 'capture', value: CaptureRecord }

export class ActivityStore {
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly activities = new Map<string, ActivityRecord>()
  private readonly captures = new Map<string, CaptureRecord>()
  private readonly listeners = new Set<(entry: JournalEntry) => void>()
  private readonly journalPath: string
  readonly capturesDirectory: string
  currentSessionId: string | null = null

  constructor(private readonly directory: string, private readonly persist = process.env.NODE_ENV !== 'test') {
    this.journalPath = path.join(directory, 'activity.jsonl')
    this.capturesDirectory = path.join(directory, 'captures')
    if (persist) {
      mkdirSync(this.capturesDirectory, { recursive: true })
      this.load()
    }
  }

  startSession(input: { host: string, port: number, username: string, auth: string, version?: string }): SessionRecord {
    const session: SessionRecord = {
      id: randomUUID(),
      host: input.host,
      port: input.port,
      username: input.username,
      auth: input.auth,
      requestedVersion: input.version ?? null,
      resolvedVersion: null,
      status: 'connecting',
      startedAt: now(),
      connectedAt: null,
      endedAt: null,
      reason: null
    }
    this.currentSessionId = session.id
    this.sessions.set(session.id, session)
    this.commit({ type: 'session', value: session })
    return session
  }

  updateCurrentSession(patch: Partial<SessionRecord>) {
    if (!this.currentSessionId) return
    const current = this.sessions.get(this.currentSessionId)
    if (!current) return
    const updated = { ...current, ...patch, id: current.id }
    this.sessions.set(updated.id, updated)
    this.commit({ type: 'session', value: updated })
  }

  startAction(name: string, input: unknown): ActivityRecord {
    const activity: ActivityRecord = {
      id: randomUUID(),
      sessionId: this.currentSessionId,
      at: now(),
      completedAt: null,
      kind: 'action',
      name,
      status: 'started',
      durationMs: null,
      input: sanitize(input),
      output: null,
      error: null
    }
    this.activities.set(activity.id, activity)
    this.commit({ type: 'activity', value: activity })
    return activity
  }

  finishAction(id: string, status: Exclude<ActivityStatus, 'started'>, output: unknown, error: string | null) {
    const current = this.activities.get(id)
    if (!current) return
    const completedAt = now()
    const updated: ActivityRecord = {
      ...current,
      status,
      completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(current.at),
      output: sanitize(output),
      error
    }
    this.activities.set(id, updated)
    this.commit({ type: 'activity', value: updated })
  }

  recordEvent(name: string, input: unknown) {
    const activity: ActivityRecord = {
      id: randomUUID(),
      sessionId: this.currentSessionId,
      at: now(),
      completedAt: now(),
      kind: 'event',
      name,
      status: 'succeeded',
      durationMs: 0,
      input: sanitize(input),
      output: null,
      error: null
    }
    this.activities.set(activity.id, activity)
    this.trimActivities()
    this.commit({ type: 'activity', value: activity })
  }

  recordCapture(capture: Omit<CaptureRecord, 'id' | 'sessionId' | 'at'>): CaptureRecord {
    const stored: CaptureRecord = {
      ...capture,
      id: randomUUID(),
      sessionId: this.currentSessionId,
      at: now()
    }
    this.captures.set(stored.id, stored)
    this.commit({ type: 'capture', value: stored })
    return stored
  }

  snapshot() {
    return {
      currentSessionId: this.currentSessionId,
      sessions: [...this.sessions.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      activities: [...this.activities.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 2_000),
      captures: [...this.captures.values()].sort((a, b) => b.at.localeCompare(a.at))
    }
  }

  subscribe(listener: (entry: JournalEntry) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private commit(entry: JournalEntry) {
    if (this.persist) appendFileSync(this.journalPath, `${JSON.stringify(entry)}\n`, 'utf8')
    for (const listener of this.listeners) listener(entry)
  }

  private load() {
    if (!existsSync(this.journalPath)) return
    const lines = readFileSync(this.journalPath, 'utf8').split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as JournalEntry
        if (entry.type === 'session') this.sessions.set(entry.value.id, entry.value)
        if (entry.type === 'activity') this.activities.set(entry.value.id, entry.value)
        if (entry.type === 'capture') this.captures.set(entry.value.id, entry.value)
      } catch { /* Preserve valid entries around a partial final line. */ }
    }
    const active = [...this.sessions.values()].find((session) => session.status === 'connected' || session.status === 'connecting')
    if (active) {
      const ended = { ...active, status: 'ended' as const, endedAt: now(), reason: 'MCP process exited' }
      this.sessions.set(ended.id, ended)
      appendFileSync(this.journalPath, `${JSON.stringify({ type: 'session', value: ended })}\n`, 'utf8')
    }
    this.trimActivities()
  }

  private trimActivities() {
    if (this.activities.size <= 5_000) return
    const keep = [...this.activities.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5_000)
    this.activities.clear()
    for (const entry of keep) this.activities.set(entry.id, entry)
  }
}

function now() {
  return new Date().toISOString()
}

function sanitize(value: unknown): unknown {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value, (key, entry) => {
      if (key === 'data' && typeof entry === 'string' && entry.length > 1_000) return `[omitted ${entry.length} characters]`
      return entry
    }))
  } catch {
    return String(value)
  }
}

