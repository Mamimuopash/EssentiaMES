import path from 'node:path'
import ExcelJS from 'exceljs'
import { NextResponse } from 'next/server'
import { route, reqInt, ApiError } from '@/lib/api'
import { db } from '@/lib/db'
import { writeAudit, L } from '@/lib/audit'
import { fmtDateTime } from '@/lib/format'

const STATO: Record<number, string> = { 0: 'In Attesa', 1: 'Inviato', 2: 'Ritornato da C/O', 3: 'Non Completato' }
const STELLE: Record<number, string> = { 1: '⭐', 2: '⭐⭐', 3: '⭐⭐⭐', 4: '⭐⭐⭐⭐', 5: '⭐⭐⭐⭐⭐' }

/** Stampa lotto su template Excel (Brighetti_Lotti/ListaArticoli), stesse celle del vecchio NPOI. */
export const GET = route<{ id: string }>({ admin: true, indirizzo: 'Brighetti_Lotti/ListaArticoli' }, async ({ params, op }) => {
  const id = reqInt(params.id)
  const lotto = await db.one<{ IdLotto: number; NomeLotto: string | null; DescrizioneLotto: string | null }>(
    `SELECT IdLotto, NomeLotto, DescrizioneLotto FROM dbo.Brighetti_Lotti WHERE IdLotto = @id`,
    { id },
  )
  if (!lotto) throw new ApiError(404, 'Lotto non trovato.')
  const articoli = await db.query<{ NomeArticolo: string | null; QuantitaArticolo: string | null; StatoArticoloLotto: number; Importanza: number | null }>(
    `SELECT la.NomeArticolo, la.[QuantitàArticolo] AS QuantitaArticolo, la.StatoArticoloLotto, a.Importanza
       FROM dbo.Brighetti_Lotti_Articoli la LEFT JOIN dbo.Brighetti_Articoli a ON a.Id = la.IdArticolo
      WHERE la.IdLotto = @id ORDER BY la.IdLottoArticolo`,
    { id },
  )
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path.join(process.cwd(), 'templates', 'Lotti.xlsx'))
  const ws = wb.worksheets[0]
  // NPOI usa indici 0-based: riga 3 -> riga Excel 4, colonna 0 -> A.
  ws.getCell('A4').value = `Operatore: ${op.name}`
  ws.getCell('E4').value = `Data: ${fmtDateTime(new Date())}`
  ws.getCell('A5').value = `Lotto N° ${lotto.NomeLotto ?? ''}`
  ws.getCell('A7').value = `Descrizione Lotto: ${lotto.DescrizioneLotto ?? ''}`
  let r = 9
  for (const a of articoli) {
    const row = ws.getRow(r)
    row.getCell(1).value = a.NomeArticolo ?? ''
    row.getCell(4).value = a.QuantitaArticolo ?? ''
    row.getCell(6).value = STATO[a.StatoArticoloLotto] ?? ''
    if (a.Importanza !== null && a.Importanza !== undefined) row.getCell(8).value = STELLE[a.Importanza] ?? '⭐'
    r++
  }
  const buf = await wb.xlsx.writeBuffer()
  await writeAudit(db, L.Warning, 'Brighetti_Lotti/ListaArticoli', `Lotto Stampato Correttamente: ${lotto.IdLotto}`, lotto.IdLotto, op)
  const now = new Date()
  const nome = `${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}_LOTTO_${lotto.NomeLotto ?? lotto.IdLotto}.xlsx`
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    },
  })
})
