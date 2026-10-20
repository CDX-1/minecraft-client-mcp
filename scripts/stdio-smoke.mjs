import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  cwd: process.cwd(),
  stderr: 'pipe'
})
const client = new Client({ name: 'minecraft-client-mcp-smoke', version: '1.0.0' })

try {
  await client.connect(transport)
  const tools = await client.listTools()
  const resources = await client.listResources()
  const status = await client.callTool({ name: 'minecraft_status', arguments: {} })
  if (tools.tools.length < 10) throw new Error(`Expected at least 10 tools, got ${tools.tools.length}`)
  if (resources.resources.length !== 2) throw new Error(`Expected 2 resources, got ${resources.resources.length}`)
  if (status.isError) throw new Error('minecraft_status returned an error')
  process.stdout.write(`stdio smoke passed: ${tools.tools.length} tools, ${resources.resources.length} resources\n`)
} finally {
  await client.close()
}
