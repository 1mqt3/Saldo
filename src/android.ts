import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { androidReleasesUrl, findAndroidUpdate } from './android-release.ts'
import type { AndroidRelease } from './android-release.ts'
import type { Theme } from './model.ts'

export interface AndroidInfo {
  version: string
  code: number
  hasUpdateBackup: boolean
}

interface AndroidPlugin {
  getInfo(): Promise<AndroidInfo>
  saveBackup(options: { json: string; name: string }): Promise<{ saved: boolean }>
  readUpdateBackup(): Promise<{ json: string }>
  installUpdate(options: { release: AndroidRelease; backup: string }): Promise<void>
}

export const isAndroid = Capacitor.getPlatform() === 'android'
export const saldoAndroid = registerPlugin<AndroidPlugin>('SaldoAndroid')

export function setAndroidBarStyle(theme: Theme) {
  if (isAndroid) void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
}

export async function checkAndroidUpdate(currentCode: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(androidReleasesUrl, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) throw new Error('GitHub временно недоступен.')
    return findAndroidUpdate(await response.json(), currentCode)
  } finally {
    clearTimeout(timeout)
  }
}
