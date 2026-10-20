import { describe, expect, it, vi } from 'vitest'
import type { Bot } from 'mineflayer'
import { acknowledgeResourcePack, installResourcePackUuidFix, normalizeResourcePackEvent } from './minecraft-client.js'

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

  it('serializes Mineflayer UUID objects as strings at the packet boundary', () => {
    const write = vi.fn()
    const uuid = {
      ascii: '123e4567-e89b-12d3-a456-426614174000',
      toString() { return this.ascii }
    }
    const bot = { _client: { write } } as unknown as Pick<Bot, '_client'>

    installResourcePackUuidFix(bot)
    bot._client.write('resource_pack_receive', { uuid, result: 3 })
    bot._client.write('resource_pack_receive', { uuid, result: 0 })

    expect(write).toHaveBeenNthCalledWith(1, 'resource_pack_receive', { uuid: uuid.ascii, result: 3 })
    expect(write).toHaveBeenNthCalledWith(2, 'resource_pack_receive', { uuid: uuid.ascii, result: 0 })
  })

  it('records modern resource-pack UUIDs in the UUID field', () => {
    const uuid = {
      toString: () => '123e4567-e89b-12d3-a456-426614174000'
    }

    expect(normalizeResourcePackEvent('https://example.test/pack.zip', uuid)).toEqual({
      url: 'https://example.test/pack.zip',
      hash: null,
      uuid: '123e4567-e89b-12d3-a456-426614174000'
    })
  })
})
