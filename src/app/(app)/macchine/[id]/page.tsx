import { notFound } from 'next/navigation'
import { requirePageUser } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import { TipoElemento } from '@/lib/enums'
import { fmtDateTime } from '@/lib/format'
import { istanzaMacchina } from '@/lib/services/macchine'
import { attivitaDisponibiliMacchina } from '@/lib/services/produzione'
import AttivitaMacchina from '@/components/AttivitaMacchina'
import { GraficoStati } from '@/components/Charts'
import IstanzaNote from './IstanzaNote'

export const metadata = { title: 'Macchina - EssentiaMES' }
export const dynamic = 'force-dynamic'

/** Scheda macchina (vecchia Macchine/Istanza). */
export default async function IstanzaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser()
  const { id } = await params
  const data = await istanzaMacchina(Number(id))
  if (!data) notFound()
  const { macchina: m, ultima, perStato, note, documenti } = data
  const attivita = await attivitaDisponibiliMacchina(m.IdMacchina)
  const cnt = await db.one<{ note: number; doc: number }>(
    `SELECT (SELECT COUNT(*) FROM dbo.Brighetti_Note WHERE IdEsterno = @id AND TypeElem = @t) AS note,
            (SELECT COUNT(*) FROM dbo.Brighetti_Documenti WHERE IdEsterno = @id AND TypeElem = @t) AS doc`,
    { id: m.IdMacchina, t: TipoElemento.Macchina },
  )
  return (
    <>
      <div className="MainTitleAccount">
        <h1 className="TitleAccount">Macchina {m.NomeMacchina}</h1>
        <h4>{m.DescrizioneMacchina}</h4>
      </div>
      <div className="row mb-4 ms-1">
        <div className="col-md-6">
          Programma: {ultima ? `${ultima.Programma ?? '-'} (${ultima.ProgrammaDescrizione ?? '-'})` : '- (-)'}
          <br />
          Stato: {ultima?.StatoOperativoMacchina ?? '-'}
        </div>
        <div className="col-md-6 text-md-end">
          Ultimi dati disp.: {ultima ? fmtDateTime(ultima.DataRilevazione) : <b>Nessun dato nell&apos;ultima settimana</b>}
          <br />
          Ultimo agg.: {fmtDateTime(new Date())}
        </div>
      </div>
      <div className="row ms-1">
        <div className="col-md-6">
          <h4>Note e Documenti</h4>
          <IstanzaNote idMacchina={m.IdMacchina} note={note} documenti={documenti} />
        </div>
        <div className="col-md-6">
          <h4>Storico Macchina</h4>
          <div style={{ maxWidth: 512 }}>
            {perStato.length > 0 ? <GraficoStati dati={perStato} /> : <p className="text-muted">Nessun dato macchina disponibile.</p>}
          </div>
        </div>
      </div>
      <div className="row mt-4" style={{ minHeight: '40vh' }}>
        <div className="col-12">
          <h2 className="page-title">Attività in corso o in previsione</h2>
          <AttivitaMacchina attivita={attivita} countNote={cnt?.note ?? 0} countDocumenti={cnt?.doc ?? 0} azionabile={!user.isAdmin} />
        </div>
      </div>
    </>
  )
}
