import { describe, expect, it, vi } from 'vitest'
import type { Bot } from 'mineflayer'
import { acknowledgeResourcePack } from './minecraft-client.js'

describe('resource-pack acknowledgement', () => {
  it('lets Mineflayer acknowledge configuration-phase requests once', () => {
    const acceptResourcePack = vi.fn()
    const bot = { _client: { state: 'configuration' }, acceptResourcePack } as unknown as Pick<Bot, '_client' | 'acceptResourcePack'>

    expect(acknowledgeResourcePack(bot)).toBe('mineflayer_configuration_handler')
    expect(acceptResourcePack).not.toHaveBeenCalled()
  })

  it('sends accepted and loaded through Mineflayer for pre-spawn/play requests', () => {
    const acceptResourcePack = vi.fn()
    const bot = { _client: { state: 'play' }, acceptResourcePack } as unknown as Pick<Bot, '_client' | 'acceptResourcePack'>

    expect(acknowledgeResourcePack(bot)).toBe('mcp_resource_pack_handler')
    expect(acceptResourcePack).toHaveBeenCalledOnce()
  })
})
