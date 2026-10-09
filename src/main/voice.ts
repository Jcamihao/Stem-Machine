import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { userDataDir } from './env'

// falas da guia de voz. As chaves batem com os rótulos das seções
// (python/sections.py) e c1..c4 são a contagem do último compasso
export const GUIDE_WORDS: Record<string, string> = {
  intro: 'Intro',
  verse: 'Verso',
  prechorus: 'Pré refrão',
  chorus: 'Refrão',
  bridge: 'Ponte',
  solo: 'Solo',
  inst: 'Instrumental',
  break: 'Pausa',
  outro: 'Final',
  c1: 'Um',
  c2: 'Dois',
  c3: 'Três',
  c4: 'Quatro'
}

function voiceDir(): string {
  return join(userDataDir(), 'voice', 'maria')
}

/* gera as falas uma vez com a voz do Windows (System.Speech, já vem no
   sistema): Maria, ou outra voz pt-BR instalada. -EncodedCommand evita
   problemas de aspas e acentos na linha de comando */
function generate(): Promise<void> {
  const dir = voiceDir()
  mkdirSync(dir, { recursive: true })
  const q = (s: string): string => `'${s.replace(/'/g, "''")}'`
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    "$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like '*Maria*' } | Select-Object -First 1",
    "if (-not $v) { $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1 }",
    "if (-not $v) { throw 'Nenhuma voz em português (pt-BR) instalada no Windows' }",
    '$s.SelectVoice($v.VoiceInfo.Name)',
    '$s.Rate = 2',
    ...Object.entries(GUIDE_WORDS).map(
      ([key, word]) => `$s.SetOutputToWaveFile(${q(join(dir, `${key}.wav`))}); $s.Speak(${q(word)})`
    ),
    '$s.SetOutputToNull()'
  ].join('\n')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
    let stderr = ''
    child.stderr?.on('data', (c: Buffer) => {
      stderr = (stderr + c.toString()).slice(-800)
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr.trim() || `voice generation failed (${code})`))
    )
  })
}

let generating: Promise<void> | null = null

export async function guideClips(): Promise<Record<string, Uint8Array>> {
  if (process.platform !== 'win32') throw new Error('The voice guide uses the Windows voice (Maria)')
  const path = (key: string): string => join(voiceDir(), `${key}.wav`)
  if (Object.keys(GUIDE_WORDS).some((key) => !existsSync(path(key)))) {
    generating ??= generate().finally(() => {
      generating = null
    })
    await generating
  }
  return Object.fromEntries(Object.keys(GUIDE_WORDS).map((key) => [key, readFileSync(path(key))]))
}
