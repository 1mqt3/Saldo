const repo = '1mqt3/Saldo'
export const androidReleasesUrl = `https://api.github.com/repos/${repo}/releases?per_page=10`

export interface AndroidRelease {
  version: string
  code: number
  notes: string
  url: string
  digest?: string
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function findAndroidUpdate(response: unknown, currentCode: number): AndroidRelease | null {
  if (!Array.isArray(response)) throw new Error('Ответ GitHub не удалось прочитать.')
  let update: AndroidRelease | null = null
  for (const release of response as unknown[]) {
    if (!record(release) || release.draft !== false || release.prerelease !== false || !Array.isArray(release.assets)) continue
    for (const asset of release.assets as unknown[]) {
      if (!record(asset) || typeof asset.name !== 'string') continue
      const match = /^saldo-(\d+\.\d+\.\d+)-vc([1-9]\d{0,9})\.apk$/.exec(asset.name)
      if (!match) continue
      const [, version, build] = match
      const code = Number(build)
      if (code > 2_100_000_000 || code <= (update?.code ?? currentCode) || release.tag_name !== `android-v${version}`) continue
      const url = `https://github.com/${repo}/releases/download/android-v${version}/${asset.name}`
      if (asset.browser_download_url !== url || asset.state !== 'uploaded') continue
      const digest = typeof asset.digest === 'string' && /^sha256:[\da-f]{64}$/i.test(asset.digest)
        ? asset.digest.slice(7).toLowerCase() : undefined
      update = { version, code, url, digest, notes: typeof release.body === 'string' ? release.body.trim() : '' }
    }
  }
  return update
}
