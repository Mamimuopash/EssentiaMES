import fs from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { route, reqInt, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { eliminaFileFisico, risolviPercorso } from '@/lib/services/documenti'

interface Doc {
  Id: number
  Nome_File: string | null
  Percorso_File: string | null
}

/** Download (Home/DownloadFile). */
export const GET = route<{ id: string }>({ indirizzo: 'Home/DownloadFile' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const d = await db.one<Doc>(`SELECT Id, Nome_File, Percorso_File FROM dbo.Brighetti_Documenti WHERE Id = @id`, { id })
  if (!d) throw new ApiError(404, 'Documento non trovato.')
  const p = await risolviPercorso(d.Percorso_File)
  if (!p) throw new ApiError(404, 'File non presente sul server (verificare UPLOAD_DIR / LEGACY_UPLOAD_DIRS).')
  const data = await fs.readFile(p)
  await writeAudit(db, L.Info, 'Home/DownloadFile', 'Scaricato File', { id }, op)
  const nome = d.Nome_File || 'documento'
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${nome.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Content-Length': String(data.length),
    },
  })
})

export const DELETE = route<{ id: string }>({ indirizzo: 'Home/DeleteFile' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const d = await db.one<Doc>(`SELECT Id, Nome_File, Percorso_File FROM dbo.Brighetti_Documenti WHERE Id = @id`, { id })
  if (d) {
    await eliminaFileFisico(d.Percorso_File)
    await db.exec(`DELETE FROM dbo.Brighetti_Documenti WHERE Id = @id`, { id })
  }
  await writeAudit(db, L.Info, 'Home/DeleteFile', 'File rimosso correttamente', { id }, op)
  return { ok: true, message: `File rimosso correttamente -> ${id}.`, id }
})
