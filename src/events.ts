export type MinecraftEventType =
  | 'chat'
  | 'message'
  | 'login'
  | 'spawn'
  | 'end'
  | 'kicked'
  | 'error'
  | 'death'
  | 'health'
  | 'entity_hurt'
  | 'entity_dead'
  | 'player_joined'
  | 'player_left'
  | 'window_open'
  | 'window_close'
  | 'msa_code'

export interface MinecraftEvent {
  seq: number
  at: string
  type: MinecraftEventType
  data: unknown
}

export class EventBuffer {
  private readonly events: MinecraftEvent[] = []
  private nextSequence = 1
  private waiters = new Set<() => void>()

  constructor(private readonly capacity: number) {}

  push(type: MinecraftEventType, data: unknown): MinecraftEvent {
    const event = { seq: this.nextSequence++, at: new Date().toISOString(), type, data }
    this.events.push(event)
    if (this.events.length > this.capacity) this.events.splice(0, this.events.length - this.capacity)
    for (const wake of this.waiters) wake()
    this.waiters.clear()
    return event
  }

  latestSequence(): number {
    return this.nextSequence - 1
  }

  read(afterSequence = 0, types?: MinecraftEventType[], limit = 100): MinecraftEvent[] {
    return this.events
      .filter((event) => event.seq > afterSequence && (!types?.length || types.includes(event.type)))
      .slice(0, limit)
  }

  async wait(afterSequence: number, types: MinecraftEventType[] | undefined, timeoutMs: number, limit: number) {
    const deadline = Date.now() + timeoutMs
    while (true) {
      const available = this.read(afterSequence, types, limit)
      const remaining = deadline - Date.now()
      if (available.length > 0 || remaining <= 0 || timeoutMs === 0) return available

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.waiters.delete(wake)
          resolve()
        }, remaining)
        const wake = () => {
          clearTimeout(timer)
          resolve()
        }
        this.waiters.add(wake)
      })
    }
  }
}
