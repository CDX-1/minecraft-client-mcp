import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import type { ControlState, EquipmentDestination } from 'mineflayer'
import { config } from './config.js'
import { eventTypes, MinecraftClient, type EntitySelector } from './minecraft-client.js'
import { entity as serializeEntity, position } from './serializers.js'
import { versionCapabilities } from './version-support.js'
import { ActivityStore } from './activity-store.js'
import { DashboardServer } from './dashboard-server.js'
import { captureWorldMap } from './world-capture.js'

const coordinates = z.object({
  x: z.number().describe('World X coordinate'),
  y: z.number().describe('World Y coordinate'),
  z: z.number().describe('World Z coordinate')
})

const selectorShape = {
  entityId: z.number().int().optional().describe('Exact runtime entity ID'),
  uuid: z.string().optional().describe('Exact entity UUID'),
  username: z.string().optional().describe('Exact player username'),
  name: z.string().optional().describe('Exact Mineflayer entity name or mob type'),
  entityType: z.string().optional().describe('Entity category such as player, mob, object, or projectile'),
  maxDistance: z.number().positive().max(256).default(64).describe('Maximum selection distance from the bot')
}

export function createServer(providedClient?: MinecraftClient) {
  const server = new McpServer({ name: 'minecraft-client-mcp', version: '1.1.2' })
  const client = providedClient ?? new MinecraftClient()
  const activity = new ActivityStore(config.dashboardDataDirectory)
  const dashboard = new DashboardServer(activity, {
    host: config.dashboardHost,
    port: config.dashboardPort,
    capturesDirectory: activity.capturesDirectory,
    getMinecraftStatus: () => client.status()
  })

  client.events.subscribe((event) => {
    activity.recordEvent(event.type, event.data)
    if (event.type === 'spawn') {
      const status = client.status()
      activity.updateCurrentSession({
        status: 'connected',
        connectedAt: event.at,
        resolvedVersion: 'version' in status && typeof status.version === 'string' ? status.version : null
      })
    }
    if (event.type === 'end' || event.type === 'kicked') {
      activity.updateCurrentSession({ status: 'ended', endedAt: event.at, reason: JSON.stringify(event.data) })
    }
  })

  const registerTool = ((name: string, toolConfig: unknown, callback: (input: any, extra: any) => Promise<any>) =>
    (server.registerTool as any)(name, toolConfig, async (input: any, extra: any) => {
      if (name === 'minecraft_connect') activity.startSession(input)
      const tracked = activity.startAction(name, input)
      try {
        const result = await callback(input, extra)
        const failed = Boolean(result?.isError)
        activity.finishAction(tracked.id, failed ? 'failed' : 'succeeded', result, failed ? result?.content?.[0]?.text ?? 'Tool failed' : null)
        if (name === 'minecraft_connect' && failed) activity.updateCurrentSession({ status: 'failed', endedAt: new Date().toISOString(), reason: result?.content?.[0]?.text ?? 'Connection failed' })
        if (name === 'minecraft_disconnect' && !failed) activity.updateCurrentSession({ status: 'ended', endedAt: new Date().toISOString(), reason: 'Disconnected by MCP client' })
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        activity.finishAction(tracked.id, 'failed', null, message)
        if (name === 'minecraft_connect') activity.updateCurrentSession({ status: 'failed', endedAt: new Date().toISOString(), reason: message })
        throw error
      }
    })) as typeof server.registerTool

  server.registerResource(
    'minecraft-status',
    'minecraft://status',
    { title: 'Minecraft client status', description: 'Current connection and player state', mimeType: 'application/json' },
    async () => resource('minecraft://status', client.status())
  )

  server.registerResource(
    'minecraft-events',
    'minecraft://events/recent',
    { title: 'Recent Minecraft events', description: 'Recent chat and client events from the bounded event buffer', mimeType: 'application/json' },
    async () => resource('minecraft://events/recent', {
      latestSequence: client.events.latestSequence(),
      events: client.events.read(Math.max(0, client.events.latestSequence() - 100), undefined, 100)
    })
  )

  server.registerResource(
    'minecraft-versions',
    'minecraft://versions',
    { title: 'Minecraft version compatibility', description: 'Installed Mineflayer version support and compatibility probes for modern releases', mimeType: 'application/json' },
    async () => resource('minecraft://versions', versionCapabilities())
  )

  server.registerResource(
    'minecraft-dashboard',
    'minecraft://dashboard',
    { title: 'Minecraft session dashboard', description: 'Local dashboard URL and retained session counts', mimeType: 'application/json' },
    async () => resource('minecraft://dashboard', {
      url: dashboard.url,
      enabled: config.dashboardEnabled,
      ...counts(activity.snapshot())
    })
  )

  registerTool('minecraft_connect', {
    title: 'Connect Minecraft client',
    description: 'Connect to a Minecraft Java server. Use offline auth for no-auth servers, or microsoft auth for online-mode servers. Microsoft device-code details are returned while connection continues in the background.',
    inputSchema: {
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535).default(25565),
      username: z.string().min(1).describe('Offline username or Microsoft account identifier'),
      auth: z.enum(['offline', 'microsoft']).default('offline'),
      version: z.string().optional().describe('Minecraft protocol version; omit to auto-detect'),
      viewDistance: z.enum(['tiny', 'short', 'normal', 'far']).default('short'),
      cacheMicrosoftAuth: z.boolean().default(true).describe('Persist Microsoft tokens in MINECRAFT_AUTH_CACHE')
    },
    annotations: { destructiveHint: false, openWorldHint: true }
  }, async (input) => safe(() => client.connect({
    host: input.host,
    port: input.port,
    username: input.username,
    auth: input.auth,
    ...(input.version ? { version: input.version } : {}),
    viewDistance: input.viewDistance,
    profilesFolder: input.cacheMicrosoftAuth ? config.authCacheDirectory : false
  })))

  registerTool('minecraft_disconnect', {
    title: 'Disconnect Minecraft client',
    description: 'Cleanly disconnect the active Minecraft client.',
    inputSchema: { reason: z.string().max(256).default('Disconnected by MCP client') },
    annotations: { destructiveHint: true }
  }, async ({ reason }) => safe(() => client.disconnect(reason)))

  registerTool('minecraft_status', {
    title: 'Get Minecraft client status',
    description: 'Return connection, player, health, game, position, and Microsoft device-auth state.',
    inputSchema: {},
    annotations: { readOnlyHint: true }
  }, async () => safe(() => client.status()))

  registerTool('minecraft_versions', {
    title: 'Get Minecraft version compatibility',
    description: 'Report the exact Minecraft versions tested by the installed Mineflayer stack and compatibility details for 26.1, 26.1.1, 26.1.2, and 26.2.',
    inputSchema: {},
    annotations: { readOnlyHint: true }
  }, async () => safe(() => versionCapabilities()))

  registerTool('minecraft_events', {
    title: 'Read or wait for Minecraft events',
    description: 'Read chat, messages, login, combat, health, player, window, and connection events using a sequence cursor. Pass the last sequence back as afterSequence to receive only new events.',
    inputSchema: {
      afterSequence: z.number().int().min(0).default(0),
      types: z.array(z.enum(eventTypes)).optional(),
      waitMs: z.number().int().min(0).max(30_000).default(0),
      limit: z.number().int().min(1).max(500).default(100)
    },
    annotations: { readOnlyHint: true }
  }, async ({ afterSequence, types, waitMs, limit }) => safe(async () => ({
    events: await client.events.wait(afterSequence, types, waitMs, limit),
    latestSequence: client.events.latestSequence()
  })))

  registerTool('minecraft_chat', {
    title: 'Send Minecraft chat or command',
    description: 'Send a chat message, whisper, or slash command. Commands are sent through the normal Minecraft chat channel and require server-side permission.',
    inputSchema: {
      action: z.enum(['chat', 'command', 'whisper']),
      message: z.string().min(1).max(2048),
      username: z.string().optional().describe('Required for whisper')
    },
    annotations: { openWorldHint: true }
  }, async ({ action, message, username }) => safe(() => client.runAction(async (bot) => {
    if (action === 'command') bot.chat(message.startsWith('/') ? message : `/${message}`)
    else if (action === 'whisper') {
      if (!username) throw new Error('username is required for whisper')
      bot.whisper(username, message)
    } else bot.chat(message)
    return { sent: true, action, message, ...(username ? { username } : {}) }
  })))

  registerTool('minecraft_move', {
    title: 'Move the Minecraft client',
    description: 'Pathfind to coordinates, follow an entity, apply low-level controls for a bounded duration, or stop all movement.',
    inputSchema: {
      action: z.enum(['goto', 'follow', 'controls', 'stop']),
      target: coordinates.optional().describe('Required for goto'),
      range: z.number().min(0).max(16).default(1),
      ...selectorShape,
      controls: z.object({
        forward: z.boolean().optional(), back: z.boolean().optional(), left: z.boolean().optional(), right: z.boolean().optional(),
        jump: z.boolean().optional(), sprint: z.boolean().optional(), sneak: z.boolean().optional()
      }).optional(),
      durationMs: z.number().int().min(0).max(30_000).default(0).describe('For controls: 0 leaves states active until stop')
    },
    annotations: { openWorldHint: true }
  }, async (input) => safe(() => client.runAction(async () => {
    if (input.action === 'goto') {
      if (!input.target) throw new Error('target is required for goto')
      return client.goto(input.target.x, input.target.y, input.target.z, input.range)
    }
    if (input.action === 'follow') return client.follow(selector(input), input.range)
    if (input.action === 'controls') {
      if (!input.controls) throw new Error('controls are required for controls action')
      return client.setControls(input.controls as Partial<Record<ControlState, boolean>>, input.durationMs)
    }
    return client.stopMovement()
  })))

  registerTool('minecraft_look', {
    title: 'Aim the Minecraft client',
    description: 'Look at an exact world point, an entity, or absolute yaw and pitch in radians.',
    inputSchema: {
      mode: z.enum(['point', 'entity', 'angles']),
      target: coordinates.optional(),
      yaw: z.number().optional(),
      pitch: z.number().optional(),
      force: z.boolean().default(true),
      ...selectorShape
    }
  }, async (input) => safe(() => client.runAction(async (bot) => {
    if (input.mode === 'point') {
      if (!input.target) throw new Error('target is required for point mode')
      await bot.lookAt(new (await import('vec3')).Vec3(input.target.x, input.target.y, input.target.z), input.force)
    } else if (input.mode === 'entity') {
      const target = client.findEntity(selector(input))
      await bot.lookAt(target.position.offset(0, target.height * 0.75, 0), input.force)
    } else {
      if (input.yaw === undefined || input.pitch === undefined) throw new Error('yaw and pitch are required for angles mode')
      await bot.look(input.yaw, input.pitch, input.force)
    }
    return { yaw: bot.entity.yaw, pitch: bot.entity.pitch }
  })))

  registerTool('minecraft_world_snapshot', {
    title: 'Get compact Minecraft world state',
    description: 'Return nearby blocks as palette-compressed coordinate tuples plus sorted entities and player state. Bounds keep responses efficient. Air is omitted by default.',
    inputSchema: {
      radius: z.number().int().min(1).max(24).default(8),
      verticalRadius: z.number().int().min(1).max(12).default(4),
      includeAir: z.boolean().default(false),
      blockLimit: z.number().int().min(1).max(config.maxSnapshotBlocks).default(Math.min(2000, config.maxSnapshotBlocks)),
      entityRadius: z.number().min(1).max(256).default(48),
      entityLimit: z.number().int().min(1).max(config.maxSnapshotEntities).default(Math.min(100, config.maxSnapshotEntities))
    },
    annotations: { readOnlyHint: true }
  }, async ({ radius, verticalRadius, includeAir, blockLimit, entityRadius, entityLimit }) =>
    safe(() => client.worldSnapshot(radius, verticalRadius, includeAir, blockLimit, entityRadius, entityLimit)))

  registerTool('minecraft_find_blocks', {
    title: 'Find nearby Minecraft blocks',
    description: 'Efficiently find the nearest loaded blocks matching one or more exact registry names such as oak_log or diamond_ore.',
    inputSchema: {
      names: z.array(z.string().min(1)).min(1).max(64),
      maxDistance: z.number().int().min(1).max(256).default(32),
      count: z.number().int().min(1).max(512).default(32)
    },
    annotations: { readOnlyHint: true }
  }, async ({ names, maxDistance, count }) => safe(() => ({ blocks: client.findBlocks(names, maxDistance, count) })))

  registerTool('minecraft_entities', {
    title: 'Query nearby Minecraft entities',
    description: 'List nearby entities, optionally filtered by exact ID, UUID, username, name, or category.',
    inputSchema: { ...selectorShape, limit: z.number().int().min(1).max(500).default(100) },
    annotations: { readOnlyHint: true }
  }, async (input) => safe(() => {
    const bot = client.bot
    const wanted = selector(input)
    const matches = Object.values(bot.entities)
      .filter((candidate) => candidate !== bot.entity && candidate.isValid)
      .filter((candidate) => candidate.position.distanceTo(bot.entity.position) <= (wanted.maxDistance ?? 64))
      .filter((candidate) => wanted.id === undefined || candidate.id === wanted.id)
      .filter((candidate) => wanted.uuid === undefined || candidate.uuid === wanted.uuid)
      .filter((candidate) => wanted.username === undefined || candidate.username === wanted.username)
      .filter((candidate) => wanted.name === undefined || candidate.name === wanted.name || candidate.mobType === wanted.name)
      .filter((candidate) => wanted.type === undefined || candidate.type === wanted.type)
      .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))
      .slice(0, input.limit)
      .map((candidate) => serializeEntity(candidate, bot.entity.position))
    return { entities: matches }
  }))

  registerTool('minecraft_attack', {
    title: 'Attack a Minecraft entity',
    description: 'Select the nearest matching entity and attack it one or more times, optionally pathfinding into range first.',
    inputSchema: {
      ...selectorShape,
      count: z.number().int().min(1).max(20).default(1),
      intervalMs: z.number().int().min(50).max(5000).default(625),
      approachRange: z.number().min(1).max(6).optional()
    },
    annotations: { destructiveHint: true, openWorldHint: true }
  }, async (input) => safe(() => client.runAction(() => client.attack(selector(input), input.count, input.intervalMs, input.approachRange))))

  registerTool('minecraft_inventory', {
    title: 'Inspect or manipulate Minecraft inventory',
    description: 'List inventory/window slots, equip or toss an item, select a hotbar slot, click a window slot, move a stack between slots, or close the current window.',
    inputSchema: {
      action: z.enum(['list', 'equip', 'toss', 'select_hotbar', 'click', 'move_slot', 'transfer', 'close_window']),
      slot: z.number().int().min(0).max(255).optional(),
      name: z.string().optional(),
      count: z.number().int().min(1).max(2304).optional(),
      destination: z.enum(['hand', 'head', 'torso', 'legs', 'feet', 'off-hand']).default('hand'),
      transferDirection: z.enum(['container_to_inventory', 'inventory_to_container']).optional(),
      mouseButton: z.number().int().min(0).max(2).default(0),
      mode: z.number().int().min(0).max(6).default(0),
      destinationSlot: z.number().int().min(0).max(255).optional()
    }
  }, async (input) => safe(() => client.runAction(async (bot) => {
    if (input.action === 'list') return client.getInventory()
    if (input.action === 'equip') return client.equip(input.slot, input.name, input.destination as EquipmentDestination)
    if (input.action === 'toss') {
      const selected = client.resolveInventoryItem(input.slot, input.name)
      const count = input.count ?? selected.count
      await bot.toss(selected.type, selected.metadata, count)
      return { tossed: true, item: selected.name, count }
    }
    if (input.action === 'select_hotbar') {
      if (input.slot === undefined || input.slot > 8) throw new Error('slot from 0 to 8 is required for select_hotbar')
      bot.setQuickBarSlot(input.slot)
      return { quickBarSlot: bot.quickBarSlot }
    }
    if (input.action === 'click') {
      if (input.slot === undefined) throw new Error('slot is required for click')
      await bot.clickWindow(input.slot, input.mouseButton, input.mode)
      return { clicked: true, window: client.getWindow() }
    }
    if (input.action === 'move_slot') {
      if (input.slot === undefined || input.destinationSlot === undefined) throw new Error('slot and destinationSlot are required for move_slot')
      await bot.moveSlotItem(input.slot, input.destinationSlot)
      return { moved: true, from: input.slot, to: input.destinationSlot, window: client.getWindow() }
    }
    if (input.action === 'transfer') {
      const window = bot.currentWindow
      if (!window) throw new Error('A container window must be open for transfer')
      if (!input.transferDirection) throw new Error('transferDirection is required for transfer')
      const selected = input.slot === undefined
        ? window.slots.find((entry) => entry && (entry.name === input.name || entry.displayName === input.name))
        : window.slots[input.slot]
      if (!selected) throw new Error('The requested item was not found in the open window')
      const containerToInventory = input.transferDirection === 'container_to_inventory'
      await bot.transfer({
        window,
        itemType: selected.type,
        metadata: selected.metadata,
        ...(input.count !== undefined ? { count: input.count } : {}),
        sourceStart: containerToInventory ? 0 : window.inventoryStart,
        sourceEnd: containerToInventory ? window.inventoryStart : window.inventoryEnd,
        destStart: containerToInventory ? window.inventoryStart : 0,
        destEnd: containerToInventory ? window.inventoryEnd : window.inventoryStart
      })
      return { transferred: true, direction: input.transferDirection, item: selected.name, count: input.count ?? 'all', window: client.getWindow() }
    }
    if (bot.currentWindow) await bot.closeWindow(bot.currentWindow)
    return { closed: true }
  })))

  registerTool('minecraft_open', {
    title: 'Open a Minecraft block or entity UI',
    description: 'Open a container block or activate an entity such as a villager, then return the resulting window slots when available.',
    inputSchema: {
      kind: z.enum(['block', 'entity']),
      target: coordinates.optional(),
      ...selectorShape
    }
  }, async (input) => safe(() => client.runAction(() => client.openTarget(input.kind, input.target, selector(input)))))

  registerTool('minecraft_block', {
    title: 'Interact with a Minecraft block',
    description: 'Inspect, activate, dig, or place the held block against a loaded block coordinate.',
    inputSchema: {
      action: z.enum(['inspect', 'activate', 'dig', 'place']),
      target: coordinates,
      face: coordinates.optional().describe('Placement face vector; defaults to the top face (0,1,0)')
    },
    annotations: { openWorldHint: true }
  }, async ({ action, target, face }) => safe(() => client.runAction(() => client.interactBlock(action, target, face))))

  registerTool('minecraft_entity', {
    title: 'Interact with a Minecraft entity',
    description: 'Inspect, activate, use the held item on, or mount the nearest matching entity; or dismount the current vehicle.',
    inputSchema: { action: z.enum(['inspect', 'activate', 'use_on', 'mount', 'dismount']), ...selectorShape },
    annotations: { openWorldHint: true }
  }, async (input) => safe(() => client.runAction(async (bot) => {
    if (input.action === 'dismount') {
      bot.dismount()
      return { dismounted: true }
    }
    return client.interactEntity(input.action, selector(input))
  })))

  registerTool('minecraft_use_item', {
    title: 'Use the held Minecraft item',
    description: 'Start or stop using the held item, consume food/potions to completion, or swing an arm.',
    inputSchema: {
      action: z.enum(['activate', 'deactivate', 'consume', 'swing']),
      offhand: z.boolean().default(false),
      hand: z.enum(['left', 'right']).default('right')
    }
  }, async ({ action, offhand, hand }) => safe(() => client.runAction(async (bot) => {
    if (action === 'activate') bot.activateItem(offhand)
    else if (action === 'deactivate') bot.deactivateItem()
    else if (action === 'consume') await bot.consume()
    else bot.swingArm(hand)
    return { action, heldItem: bot.heldItem?.name ?? null, usingHeldItem: bot.usingHeldItem }
  })))

  registerTool('minecraft_capture', {
    title: 'Capture the nearby Minecraft world',
    description: 'Create a top-down PNG capture of loaded blocks and entities around the client. The image is returned to the agent, persisted with the current session, and displayed in the dashboard.',
    inputSchema: {
      radius: z.number().int().min(4).max(32).default(16)
    },
    annotations: { readOnlyHint: true }
  }, async ({ radius }) => {
    try {
      const captured = await client.runAction(async (bot) => captureWorldMap(bot, radius, activity.capturesDirectory))
      const stored = activity.recordCapture({
        filename: captured.filename,
        mimeType: captured.mimeType,
        width: captured.width,
        height: captured.height,
        radius: captured.radius,
        center: captured.center,
        size: captured.size
      })
      const metadata = {
        ...stored,
        dashboardUrl: dashboard.url ? `${dashboard.url}/captures/${encodeURIComponent(stored.filename)}` : null
      }
      return {
        content: [
          { type: 'image' as const, data: captured.buffer.toString('base64'), mimeType: captured.mimeType },
          { type: 'text' as const, text: JSON.stringify(metadata, null, 2) }
        ],
        structuredContent: metadata
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { isError: true, content: [{ type: 'text' as const, text: message }] }
    }
  })

  registerTool('minecraft_dashboard', {
    title: 'Open the Minecraft session dashboard',
    description: 'Start the local read-only dashboard if necessary and optionally open it in the default browser.',
    inputSchema: { openBrowser: z.boolean().default(true) },
    annotations: { readOnlyHint: true }
  }, async ({ openBrowser }) => safe(async () => {
    const url = await dashboard.start()
    if (openBrowser) dashboard.open()
    return { url, opened: openBrowser, ...counts(activity.snapshot()) }
  }))

  registerTool('minecraft_raw_packet', {
    title: 'Send a raw Minecraft protocol packet',
    description: 'Advanced escape hatch for a protocol packet name and payload. Disabled unless MINECRAFT_ALLOW_RAW_PACKETS=true. Invalid packets may disconnect or corrupt client state.',
    inputSchema: { name: z.string().min(1), data: z.record(z.string(), z.unknown()) },
    annotations: { destructiveHint: true, openWorldHint: true }
  }, async ({ name, data }) => safe(() => client.writeRawPacket(name, data)))

  return { server, client, dashboard, activity }
}

function selector(input: {
  entityId?: number | undefined
  uuid?: string | undefined
  username?: string | undefined
  name?: string | undefined
  entityType?: string | undefined
  maxDistance?: number | undefined
}): EntitySelector {
  return {
    ...(input.entityId !== undefined ? { id: input.entityId } : {}),
    ...(input.uuid !== undefined ? { uuid: input.uuid } : {}),
    ...(input.username !== undefined ? { username: input.username } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.entityType !== undefined ? { type: input.entityType } : {}),
    ...(input.maxDistance !== undefined ? { maxDistance: input.maxDistance } : {})
  }
}

async function safe(action: () => unknown | Promise<unknown>) {
  try {
    const data = await action()
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      structuredContent: normalizeObject(data)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { isError: true, content: [{ type: 'text' as const, text: message }] }
  }
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return { value }
}

function resource(uri: string, value: unknown) {
  return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }] }
}

function counts(snapshot: { sessions: unknown[], activities: unknown[], captures: unknown[] }) {
  return {
    sessionCount: snapshot.sessions.length,
    activityCount: snapshot.activities.length,
    captureCount: snapshot.captures.length
  }
}
