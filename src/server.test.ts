import { afterEach, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from './server.js'

describe('MCP server', () => {
  const closers: Array<() => Promise<void>> = []

  afterEach(async () => {
    await Promise.all(closers.splice(0).map((close) => close()))
  })

  it('advertises the complete tool surface and exposes disconnected status', async () => {
    const { server } = createServer()
    const mcpClient = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)])
    closers.push(() => mcpClient.close(), () => server.close())

    const tools = await mcpClient.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'minecraft_connect', 'minecraft_chat', 'minecraft_move', 'minecraft_attack',
      'minecraft_inventory', 'minecraft_block', 'minecraft_entity', 'minecraft_world_snapshot',
      'minecraft_capture', 'minecraft_dashboard', 'minecraft_raw_packet'
    ]))

    const result = await mcpClient.callTool({ name: 'minecraft_status', arguments: {} })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({ connected: false, state: 'disconnected' })
  })
})
