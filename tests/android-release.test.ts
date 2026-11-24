import assert from 'node:assert/strict'
import test from 'node:test'
import { findAndroidUpdate } from '../src/android-release.ts'

function release(code: number) {
  const version = `1.0.${code - 1}`
  const name = `saldo-${version}-vc${code}.apk`
  return {
    draft: false, prerelease: false, tag_name: `android-v${version}`, body: '- Новая версия',
    assets: [{
      name, state: 'uploaded', digest: 'sha256:' + 'A'.repeat(64),
      browser_download_url: `https://github.com/1mqt3/Saldo/releases/download/android-v${version}/${name}`,
    }],
  }
}

test('Android находит наибольший versionCode и получает описание опубликованного выпуска', () => {
  const update = findAndroidUpdate([release(2), release(4), release(3)], 1)
  assert.equal(update?.code, 4)
  assert.equal(update?.version, '1.0.3')
  assert.equal(update?.notes, '- Новая версия')
  assert.equal(update?.digest, 'a'.repeat(64))
  assert.equal(findAndroidUpdate([release(2)], 2), null)
})

test('черновики, предварительные выпуски и чужие APK не предлагаются к установке', () => {
  const unrelated = release(7)
  unrelated.assets[0].browser_download_url = unrelated.assets[0].browser_download_url.replace('1mqt3', 'someone-else')
  assert.equal(findAndroidUpdate([{ ...release(8), draft: true }, { ...release(9), prerelease: true }, unrelated], 1), null)
  assert.throws(() => findAndroidUpdate({ message: 'Rate limit' }, 1), /не удалось прочитать/)
})
