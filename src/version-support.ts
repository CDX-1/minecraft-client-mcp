import minecraftData from 'minecraft-data'
import mineflayer from 'mineflayer'

const { latestSupportedVersion, oldestSupportedVersion, testedVersions } = mineflayer

export interface VersionSupport {
  requestedVersion: string
  supported: boolean
  testedByMineflayer: boolean
  protocolKnown: boolean
  gameDataAvailable: boolean
  resolvedVersion: string | null
  protocolVersion: number | null
  reason: string
}

export function inspectVersion(requestedVersion: string): VersionSupport {
  const protocol = minecraftData.versionsByMinecraftVersion.pc[requestedVersion]
  const data = minecraftData(requestedVersion)
  const latest = minecraftData(latestSupportedVersion)
  const tested = testedVersions.includes(requestedVersion)

  if (!protocol) {
    return result(false, 'This version is not present in the installed Minecraft protocol registry.')
  }
  if (!data?.version) {
    return result(false, 'The protocol number is known, but complete block, item, entity, and packet data is not available to Mineflayer.')
  }

  const beyondLatest = data.version['>'](latestSupportedVersion) && data.version.version !== latest.version.version
  const beforeOldest = data.version['<'](oldestSupportedVersion)
  if (beyondLatest) return result(false, `The installed Mineflayer release supports up to ${latestSupportedVersion}.`)
  if (beforeOldest) return result(false, `The installed Mineflayer release supports versions from ${oldestSupportedVersion}.`)

  return result(true, tested
    ? 'Officially listed as a tested Mineflayer version.'
    : `Compatible through Mineflayer's ${data.version.minecraftVersion} data/protocol mapping.`)

  function result(supported: boolean, reason: string): VersionSupport {
    return {
      requestedVersion,
      supported,
      testedByMineflayer: tested,
      protocolKnown: Boolean(protocol),
      gameDataAvailable: Boolean(data?.version),
      resolvedVersion: data?.version?.minecraftVersion ?? null,
      protocolVersion: protocol?.version ?? data?.version?.version ?? null,
      reason
    }
  }
}

export function versionCapabilities() {
  return {
    mineflayer: { oldestSupportedVersion, latestSupportedVersion, testedVersions },
    requestedVersions: [inspectVersion('26.1'), inspectVersion('26.1.1'), inspectVersion('26.1.2'), inspectVersion('26.2')],
    guidance: 'Omit version to auto-detect. Unsupported future protocols require upstream Mineflayer, node-minecraft-protocol, and minecraft-data support; they cannot be enabled safely with a version alias.'
  }
}
