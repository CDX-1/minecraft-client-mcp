import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Vec3 } from 'vec3'
import type { Bot } from 'mineflayer'
import { ActivityStore } from './activity-store.js'
import { DashboardServer } from './dashboard-server.js'
import { captureWorldMap } from './world-capture.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('dashboard', () => {
  it('serves live state with restrictive browser headers', async () => {
    const directory = temporaryDirectory()
    const store = new ActivityStore(directory, false)
    const dashboard = new DashboardServer(store, {
      host: '127.0.0.1',
      port: 0,
      capturesDirectory: store.capturesDirectory,
      getMinecraftStatus: () => ({ connected: false, state: 'disconnected' })
    })
    const url = await dashboard.start()
    try {
      const action = store.startAction('minecraft_status', {})
      store.finishAction(action.id, 'succeeded', { connected: false }, null)
      const [page, state] = await Promise.all([fetch(url), fetch(`${url}/api/state`).then((response) => response.json())])

      expect(page.status).toBe(200)
      expect(page.headers.get('content-security-policy')).toContain("default-src 'self'")
      expect(await page.text()).toContain('Minecraft sessions')
      expect(state.activities).toHaveLength(1)
      expect(state.activities[0]).toMatchObject({ name: 'minecraft_status', status: 'succeeded' })
    } finally {
      await dashboard.stop()
    }
  })

  it('restores sessions and actions from its append-only journal', () => {
    const directory = temporaryDirectory()
    const first = new ActivityStore(directory, true)
    const session = first.startSession({ host: 'localhost', port: 25565, username: 'Bot', auth: 'offline', version: '26.1' })
    const action = first.startAction('minecraft_connect', { host: 'localhost' })
    first.finishAction(action.id, 'succeeded', { connected: true }, null)

    const restored = new ActivityStore(directory, true).snapshot()
    expect(restored.sessions[0]).toMatchObject({ id: session.id, status: 'ended', reason: 'MCP process exited' })
    expect(restored.activities[0]).toMatchObject({ id: action.id, status: 'succeeded' })
  })

  it('writes valid PNG world captures', () => {
    const directory = temporaryDirectory()
    const self = { id: 1, position: new Vec3(0, 64, 0) }
    const bot = {
      entity: self,
      entities: { 1: self },
      blockAt: (point: Vec3) => ({
        name: point.y <= 64 ? 'grass_block' : 'air',
        light: 0,
        skyLight: 15
      })
    } as unknown as Bot

    const capture = captureWorldMap(bot, 4, directory)
    expect(capture.width).toBe(90)
    expect(capture.height).toBe(90)
    expect(readFileSync(path.join(directory, capture.filename)).subarray(0, 8))
      .toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  })
})

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'minecraft-mcp-dashboard-'))
  temporaryDirectories.push(directory)
  return directory
}
