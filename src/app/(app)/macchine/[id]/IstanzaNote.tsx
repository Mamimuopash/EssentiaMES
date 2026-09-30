'use client'

import { useRouter } from 'next/navigation'
import { BottoniNoteFile, ListaDocumenti, ListaNote, type DocumentoView, type NotaView } from '@/components/NoteDocumenti'
import { TipoElemento } from '@/lib/enums'

export default function IstanzaNote({ idMacchina, note, documenti }: { idMacchina: number; note: NotaView[]; documenti: DocumentoView[] }) {
  const router = useRouter()
  const refresh = () => router.refresh()
  return (
    <>
      <ListaNote note={note} onChange={refresh} />
      <div className="mt-2" />
      <ListaDocumenti documenti={documenti} onChange={refresh} />
      <BottoniNoteFile id={idMacchina} type={TipoElemento.Macchina} onChange={refresh} />
    </>
  )
}
