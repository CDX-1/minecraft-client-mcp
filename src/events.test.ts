import { describe, expect, it } from 'vitest'
import { EventBuffer } from './events.js'

describe('EventBuffer', () => {
  it('keeps a bounded, cursor-readable history', () => {
    const buffer = new EventBuffer(2)
    buffer.push('login', {})
    const second = buffer.push('chat', { message: 'hello' })
    buffer.push('health', { health: 20 })

    expect(buffer.read(0).map((event) => event.type)).toEqual(['chat', 'health'])
    expect(buffer.read(second.seq).map((event) => event.type)).toEqual(['health'])
  })

  it('continues waiting when an unrelated event arrives', async () => {
    const buffer = new EventBuffer(10)
    const waiting = buffer.wait(0, ['chat'], 1_000, 10)
    buffer.push('health', { health: 20 })
    setTimeout(() => buffer.push('chat', { message: 'ready' }), 10)
    const result = await waiting

    expect(result).toHaveLength(1)
    expect(result[0]?.type).toBe('chat')
  })
})
