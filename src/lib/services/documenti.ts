import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'

/*
 * Note e documenti allegati (Brighetti_Note / Brighetti_Documenti), porting di
 * HomeController.AddNota/DeleteNota/AddFile/DeleteFile/DownloadFile.
 *
 * I file sono salvati in UPLOAD_DIR. I documenti caricati dal vecchio software
 * hanno in Percorso_File un percorso Windows (es. C:\inetpub\...\upload_documenti\x.pdf):
 * basta copiare quella cartella in UPLOAD_DIR (o elencarla in LEGACY_UPLOAD_DIRS)
 * e vengono ritrovati per nome file.
 */

export function uploadDir(): string {
  // turbopackIgnore: cartella dati esterna all'app, da non includere nel bundle standalone.
  return path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'upload_documenti'))
}

function radiciConsentite(): string[] {
  const legacy = (process.env.LEGACY_UPLOAD_DIRS || '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => path.resolve(/* turbopackIgnore: true */ s))
  return [uploadDir(), ...legacy]
}

export const maxUploadBytes = () => Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024

function dentro(root: string, p: string) {
  const rel = path.relative(root, p)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

async function esiste(p: string) {
  try {
    const s = await fs.stat(p)
    return s.isFile()
  } catch {
    return false
  }
}

/** Trova il file fisico di un documento (percorso salvato o, in fallback, nome file nelle cartelle consentite). */
export async function risolviPercorso(percorsoSalvato: string | null): Promise<string | null> {
  if (!percorsoSalvato) return null
  const roots = radiciConsentite()
  const diretto = path.resolve(percorsoSalvato)
  if (roots.some((r) => dentro(r, diretto)) && (await esiste(diretto))) return diretto
  const base = percorsoSalvato.split(/[\\/]/).pop() || ''
  if (!base) return null
  for (const r of roots) {
    const p = path.join(r, base)
    if (dentro(r, p) && (await esiste(p))) return p
  }
  return null
}

function nomeSicuro(nome: string) {
  const base = (nome.split(/[\\/]/).pop() || 'file').replace(/\s+/g, '')
  return base.replace(/[^A-Za-z0-9._()\-àèéìòùÀÈÉÌÒÙ]/g, '_').slice(0, 150) || 'file'
}

function timestamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export async function salvaFile(nomeOriginale: string, dati: Buffer): Promise<string> {
  const dir = uploadDir()
  await fs.mkdir(dir, { recursive: true })
  // Prefisso data/ora: evita di sovrascrivere file omonimi (il vecchio software li sovrascriveva).
  const dest = path.join(dir, `${timestamp()}_${nomeSicuro(nomeOriginale)}`)
  await fs.writeFile(dest, dati)
  return dest
}

export async function eliminaFileFisico(percorsoSalvato: string | null) {
  const p = await risolviPercorso(percorsoSalvato)
  if (p) await fs.unlink(p).catch(() => undefined)
}

export interface Nota {
  Id: number
  Contenuto_Nota: string | null
  Data_Nota: Date
  Operatore_Nome: string | null
}

export interface Documento {
  Id: number
  Nome_File: string | null
  DataCreazioneFile: Date
  Operatore_Nome: string | null
}

export async function noteDi(tipo: number, idEsterno: number): Promise<Nota[]> {
  return db.query<Nota>(
    `SELECT Id, Contenuto_Nota, Data_Nota, Operatore_Nome FROM dbo.Brighetti_Note WHERE IdEsterno = @id AND TypeElem = @t ORDER BY Data_Nota DESC`,
    { id: idEsterno, t: tipo },
  )
}

export async function documentiDi(tipo: number, idEsterno: number): Promise<Documento[]> {
  return db.query<Documento>(
    `SELECT Id, Nome_File, DataCreazioneFile, Operatore_Nome FROM dbo.Brighetti_Documenti WHERE IdEsterno = @id AND TypeElem = @t ORDER BY DataCreazioneFile DESC`,
    { id: idEsterno, t: tipo },
  )
}
