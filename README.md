# Minecraft Client MCP

A local [Model Context Protocol](https://modelcontextprotocol.io/) server that gives an agent end-to-end control of a Minecraft Java Edition client through [Mineflayer](https://github.com/PrismarineJS/mineflayer).

It supports offline/no-auth and Microsoft device-code login, chat and slash commands, pathfinding and direct controls, combat, block/entity interaction, inventory and container UIs, event-driven chat/state reads, compact world snapshots, nearby block/entity queries, and an opt-in raw packet escape hatch.

## Minecraft version compatibility

- **26.1:** supported and included in Mineflayer's tested-version list.
- **26.1.1 / 26.1.2:** supported through the shared 26.1 protocol and game-data mapping.
- **26.2:** not yet safe to claim as supported. Its protocol number is registered, but the currently published Mineflayer stack does not include complete 26.2 game data or list it as a supported client version. The upstream 26.2 Mineflayer and protocol changes are still under review.

Use `minecraft_versions` or read `minecraft://versions` to inspect compatibility at runtime. The server validates an explicitly requested version before connecting, and omitting `version` still enables normal server auto-detection. A 26.2 server can only be used today if it provides a compatible 26.1 endpoint, such as a correctly configured ViaVersion/ViaBackwards setup.

## Requirements

- Node.js 22 or newer
- A reachable Minecraft Java Edition server
- For Microsoft auth, an account entitled to Minecraft Java Edition

## Install and build

```bash
npm install
npm run build
```

Run it directly over stdio:

```bash
npm start
```

For development:

```bash
npm run dev
```

## MCP client configuration

### Claude Code: install directly from GitHub

After this repository is published, Claude Code can install and launch it without a manual clone:

```powershell
claude mcp add minecraft --scope user -- cmd /c npx -y github:CDX-1/minecraft-client-mcp
```

Verify the connection with:

```powershell
claude mcp get minecraft
```

On macOS or Linux, omit the Windows `cmd /c` wrapper:

```bash
claude mcp add minecraft --scope user -- npx -y github:CDX-1/minecraft-client-mcp
```

### Local checkout

Use an absolute path in real MCP client configuration. For example:

```json
{
  "mcpServers": {
    "minecraft": {
      "command": "node",
      "args": ["D:/projects/minecraft-client-mcp/dist/index.js"],
      "env": {
        "MINECRAFT_AUTH_CACHE": "D:/projects/minecraft-client-mcp/.minecraft-auth"
      }
    }
  }
}
```

The server writes protocol data only to stdout; diagnostics and Microsoft device-code instructions go to stderr.

## Login flows

Call `minecraft_connect` with:

- `auth: "offline"` for offline-mode/no-auth servers. `username` is the in-game name.
- `auth: "microsoft"` for online-mode servers. The first login returns or emits a `msa_code` event containing the verification URL and user code. Complete that browser flow, then poll `minecraft_status` or wait on `minecraft_events`. Tokens are cached by default in `.minecraft-auth` (configurable below).

Only one Minecraft session is managed by each MCP server process. Call `minecraft_disconnect` before connecting to a different server.

## Tools

| Tool | Purpose |
|---|---|
| `minecraft_connect` / `minecraft_disconnect` | Session lifecycle and offline/Microsoft authentication |
| `minecraft_status` | Connection, health, food, position, dimension, held item, and auth state |
| `minecraft_versions` | Installed Mineflayer compatibility and modern-version probes |
| `minecraft_events` | Cursor-based read/long-poll for chat, messages, combat, players, windows, and connection events |
| `minecraft_chat` | Chat, whisper, and slash-command execution |
| `minecraft_move` | A* pathfinding, dynamic following, low-level controls, and stop |
| `minecraft_look` | Aim at a point/entity or set yaw and pitch |
| `minecraft_attack` | Select, approach, aim at, and attack entities |
| `minecraft_inventory` | Inspect, equip, toss, select hotbar, click/move slots, transfer container stacks, and close windows |
| `minecraft_open` | Open container blocks or activate entity UIs |
| `minecraft_block` | Inspect, activate, dig, and place against blocks |
| `minecraft_entity` | Inspect, activate, use-on, mount, and dismount |
| `minecraft_use_item` | Activate, consume, deactivate, or swing |
| `minecraft_world_snapshot` | Palette-compressed nearby blocks, entities, and bot state |
| `minecraft_find_blocks` | Efficient nearest-block lookup by registry name |
| `minecraft_entities` | Bounded and filtered entity query |
| `minecraft_raw_packet` | Opt-in protocol-level packet write |

Three MCP resources are also available: `minecraft://status`, `minecraft://versions`, and `minecraft://events/recent`.

### Efficient world-state loop

For agent workflows, use this pattern:

1. Read `minecraft_status` once.
2. Use `minecraft_world_snapshot` with a small radius (the default is 8). Blocks are tuples indexed into a name palette, which avoids repeating block names.
3. Use `minecraft_find_blocks` for goal-directed searches instead of requesting a large cube.
4. Track the `latestSequence` returned by `minecraft_events`, and pass it back as `afterSequence` to read only deltas.

The server intentionally uses structured state rather than a rendered screenshot. This is much smaller, deterministic, and directly actionable by an agent. A visual viewer can be added independently without changing the MCP surface.

## Environment variables

| Variable | Default | Meaning |
|---|---:|---|
| `MINECRAFT_AUTH_CACHE` | `.minecraft-auth` | Microsoft token cache directory |
| `MINECRAFT_CONNECT_TIMEOUT_MS` | `60000` | Spawn timeout, from 1s to 5m |
| `MINECRAFT_EVENT_BUFFER_SIZE` | `500` | Retained event count |
| `MINECRAFT_MAX_SNAPSHOT_BLOCKS` | `5000` | Hard ceiling for blocks returned per snapshot |
| `MINECRAFT_MAX_SNAPSHOT_ENTITIES` | `256` | Hard ceiling for entities returned per snapshot |
| `MINECRAFT_ALLOW_RAW_PACKETS` | `false` | Enables `minecraft_raw_packet` when exactly `true` |

## Raw packet safety

Raw packets bypass Mineflayer's high-level state model. Packet names and payloads are Minecraft-version-specific; malformed writes may disconnect the client or desynchronize local state. The tool is disabled by default and should only be enabled for trusted MCP callers.

## Verification

```bash
npm run build
npm test
npm run test:stdio
```

The automated suite validates the event cursor/long-poll behavior and performs an in-memory MCP handshake, tool discovery, and status call. Connecting to a real server is intentionally left as an environment-specific integration check.

## Scope and security

This is a local stdio MCP server, so transport authentication is delegated to the host MCP application. Minecraft authentication is handled by Mineflayer/minecraft-protocol. Treat access to this MCP server as equivalent to control of the connected player: tools can run permitted server commands, move items, alter the world, attack entities, and—when explicitly enabled—send arbitrary packets.
