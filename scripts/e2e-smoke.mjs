#!/usr/bin/env node
/*
 * Test end-to-end di EssentiaMES contro un'istanza avviata e un DB di TEST
 * inizializzato con `npm run db:init -- --create-db --seed`.
 *
 *   BASE_URL=http://localhost:3000 npm run e2e
 *
 * Percorre il flusso completo (login, anagrafiche, ODP, attivita' operatore con
 * quantita' parziale, versamenti tra magazzini, riordino automatico, Mexal,
 * lotti + Excel, documenti, planimetria, utenti, sicurezza) e verifica il DB.
 * ATTENZIONE: scrive dati. NON eseguire sul database di produzione.
 */
import { buildConfig, loadEnv, sql } from './_lib.mjs'

loadEnv()
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ADMIN = { username: 'admin', password: process.env.SEED_ADMIN_PASSWORD || 'Admin.2026!' }
const OPER = { username: 'operatore', password: process.env.SEED_OPERATORE_PASSWORD || 'Operatore.2026!' }
const TAG = `E2E${Date.now().toString().slice(-6)}`

let passed = 0
const failures = []
function check(cond, msg, extra) {
  if (cond) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failures.push(msg)
    console.log(`  ✗ ${msg}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '')
  }
}

class Client {
  constructor(name) {
    this.name = name
    this.cookie = ''
  }
  async req(method, path, body, opts = {}) {
    const headers = { ...(opts.headers || {}) }
    if (this.cookie) headers.cookie = this.cookie
    let payload
    if (body instanceof FormData) payload = body
    else if (body !== undefined) {
      payload = JSON.stringify(body)
      headers['content-type'] = 'application/json'
    }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' })
    const set = res.headers.getSetCookie?.() || []
    for (const c of set) if (c.startsWith('essentia_session=')) this.cookie = c.split(';')[0]
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('json') ? await res.json() : opts.raw ? Buffer.from(await res.arrayBuffer()) : await res.text()
    return { status: res.status, data, headers: res.headers }
  }
  get(p, o) { return this.req('GET', p, undefined, o) }
  post(p, b, o) { return this.req('POST', p, b ?? {}, o) }
  put(p, b) { return this.req('PUT', p, b) }
  patch(p, b) { return this.req('PATCH', p, b) }
  del(p) { return this.req('DELETE', p) }
  async login(u) {
    const r = await this.post('/api/auth/login', u)
    return r
  }
}

const pool = await new sql.ConnectionPool(buildConfig()).connect()
const q = async (text, params = {}) => {
  const r = pool.request()
  for (const [k, v] of Object.entries(params)) r.input(k, v)
  return (await r.query(text)).recordset
}

async function main() {
  console.log(`EssentiaMES e2e su ${BASE} (tag ${TAG})`)

  console.log('\n[1] Stato e autenticazione')
  const anon = new Client('anon')
  const h = await anon.get('/api/health')
  check(h.status === 200 && h.data.ok, 'health: DB connesso', h.data)
  const redir = await anon.get('/dashboard')
  check(redir.status === 307 && (redir.headers.get('location') || '').includes('/login'), 'pagina protetta -> redirect al login')
  check((await anon.get('/api/articoli')).status === 401, 'API senza sessione -> 401')
  const bad = await anon.login({ username: 'admin', password: 'sbagliata' })
  check(bad.status === 401 && !bad.data.ok, 'login con password errata rifiutato')

  const admin = new Client('admin')
  const la = await admin.login(ADMIN)
  check(la.data.ok && la.data.redirect === '/dashboard' && admin.cookie, 'login admin', la.data)
  const oper = new Client('operatore')
  const lo = await oper.login(OPER)
  check(lo.data.ok && lo.data.redirect === '/operatore', 'login operatore -> postazione', lo.data)

  console.log('\n[2] Pagine (render lato server)')
  const mac = (await q(`SELECT TOP 1 IdMacchina FROM dbo.Brighetti_Macchine WHERE NomeMacchina = N'Mazak 200MSY L'`))[0]
  // DB di test: eventuali attivita' rimaste "in corso" da esecuzioni precedenti vengono sospese.
  await q(`UPDATE dbo.[Brighetti_Attività] SET [StatoAttività] = 3 WHERE [StatoAttività] IN (1, 2)`)
  const pagine = ['/dashboard', '/cruscotto', '/articoli', '/magazzini', '/giacenze', '/lotti', '/reparti', '/macchine', '/procedure', '/storico',
    '/automazioni', '/ordini-automatici', '/sync-mexal', '/carrello', '/account', '/account/password', `/macchine/${mac.IdMacchina}`, `/macchine/${mac.IdMacchina}/analisi`]
  for (const p of pagine) {
    const r = await admin.get(p)
    check(r.status === 200 && typeof r.data === 'string' && r.data.includes('</html>'), `GET ${p} -> 200`, r.status)
  }
  const po = await oper.get('/operatore')
  check(po.status === 200 && po.data.includes('Mazak 200MSY L'), 'postazione operatore mostra la sua macchina')
  check((await oper.get('/cruscotto')).status === 307, 'operatore non accede alle pagine admin')
  check((await oper.get('/api/articoli')).status === 403, 'operatore -> API admin 403')

  console.log('\n[3] Anagrafiche e ciclo automatico')
  const codice = `G8-${TAG}`
  const ca = await admin.post('/api/articoli', { CodiceArticolo: codice, DescrizioneArticolo: 'Broccia test e2e', Importanza: 3, FamigliaId: 0, LottoMinimo: 25 })
  check(ca.data.ok && /Ciclo di lavoro standard creato \(10 fasi\)/.test(ca.data.message), 'crea articolo G8 con ciclo standard (10 fasi)', ca.data)
  const dup = await admin.post('/api/articoli', { CodiceArticolo: codice })
  check(!dup.data.ok && dup.status === 409, 'codice articolo duplicato rifiutato')
  const lista = await admin.get(`/api/articoli?search=${encodeURIComponent(codice)}&length=5`)
  check(lista.data.ok && lista.data.recordsFiltered === 1, 'ricerca server-side articoli', lista.data)
  const idArt = lista.data.data[0].Id
  const dett = await admin.get(`/api/articoli/${idArt}`)
  check(dett.data.procedure.length === 10 && dett.data.procedure[5].NomeAttività === 'Versamento da Trattamento a Rettifica', 'dettaglio articolo con ciclo', dett.data.procedure?.length)
  const ed = await admin.put(`/api/articoli/${idArt}`, { CodiceArticolo: codice, DescrizioneArticolo: 'Broccia test e2e (mod)', Importanza: 4, FamigliaId: 0, LottoMinimo: 25 })
  check(ed.data.ok, 'modifica articolo')
  const rep = await admin.post('/api/reparti', { NomeReparto: `Rep ${TAG}`, DescrizioneReparto: 'x' })
  check(rep.data.ok, 'crea reparto')
  check((await admin.put(`/api/reparti/${rep.data.id}`, { NomeReparto: `Rep ${TAG} b`, DescrizioneReparto: 'y' })).data.ok, 'modifica reparto')
  const mg = await admin.post('/api/magazzini', { CodiceMagazzino: `Mag ${TAG}`, DescrizioneMagazzino: 'x', TipologiaMagazzino: 1 })
  check(mg.data.ok, 'crea magazzino conto lavoro')
  const mc = await admin.post('/api/macchine', { NomeMacchina: `Macchina ${TAG}`, DescrizioneMacchina: 'x', IdReparto: rep.data.id, IdUtente: '0', TipologiaMacchina: 0 })
  check(mc.data.ok, 'crea macchina')
  check((await admin.del(`/api/macchine/${mc.data.id}`)).data.ok, 'elimina macchina')
  check((await admin.del(`/api/reparti/${rep.data.id}`)).data.ok, 'elimina reparto')
  check((await admin.del(`/api/magazzini/${mg.data.id}`)).data.ok, 'elimina magazzino')
  const opz = await admin.get('/api/opzioni?tipo=operatori')
  check(opz.data.items.some((x) => x.label === 'operatore'), 'opzioni: elenco operatori')

  console.log('\n[4] Automatismo lotti ON, ODP e flusso operatore')
  const imp = await admin.get('/automazioni') // crea i default
  check(imp.status === 200, 'pannello automazioni (crea impostazioni di default)')
  const toggleId = async (chiave) => (await q(`SELECT Id, Valore FROM dbo.Brighetti_Impostazioni WHERE Chiave = @c`, { c: chiave }))[0]
  const tl = await toggleId('lotti.creazione_automatica_abilitato')
  if (tl.Valore !== 'true') check((await admin.post(`/api/impostazioni/${tl.Id}/toggle`)).data.nuovoStato === true, 'attiva creazione lotti automatica')

  const odp = await admin.post('/api/odp', { IdArticolo: idArt, Qta: 10 })
  check(odp.data.ok && /^\d{2}\/\d{2}\/\d{4}_\d+$/.test(odp.data.odp), 'crea ODP (formato dd/MM/yyyy_IdProcedura)', odp.data)
  const att = await q(`SELECT [IdAttività] AS id, IncrementaleProcedura AS inc, [StatoAttività] AS s, idMacchinaMagazzino AS m FROM dbo.[Brighetti_Attività] WHERE OrdineDiProduzione = @o AND CodiceArticolo = @c ORDER BY [IdAttività]`, { o: odp.data.odp, c: codice })
  check(att.length === 10 && att[0].s === 0 && att.slice(1).every((a) => a.s === 99), 'ODP: fase 1 in attesa, altre bloccate', att.map((a) => a.s))
  const f1 = att[0].id
  const vuota = await admin.post('/api/odp', { IdArticolo: idArt, Qta: 0 })
  check(!vuota.data.ok, 'ODP con quantità 0 rifiutato')

  // Operatore: apre in attrezzaggio, conclude attrezzaggio (-> lavorazione), quantita' parziale, poi completa.
  check((await oper.get(`/api/attivita/${f1}`)).data.ok, 'operatore legge la propria attività')
  const a1 = await oper.post(`/api/attivita/${f1}/apri`, { StatoAttivita: 0 })
  check(a1.data.ok && a1.data.pathRedirect === `/operatore/attivita/${f1}`, 'apri attività in attrezzaggio', a1.data)
  const pagAtt = await oper.get(`/operatore/attivita/${f1}`)
  check(pagAtt.status === 200 && pagAtt.data.includes('In Attrezzaggio'), 'pagina attività in corso')
  const redirOp = await oper.get('/operatore')
  check(redirOp.status === 307 && (redirOp.headers.get('location') || '').endsWith(`/operatore/attivita/${f1}`), 'postazione -> redirect all’attività in corso')
  await new Promise((r) => setTimeout(r, 1200))
  const c1 = await oper.post(`/api/attivita/${f1}/concludi`, { QuantitaProdotta: 0, QuantitaScartata: 0 })
  check(c1.data.ok, 'fine attrezzaggio -> lavorazione', c1.data)
  let s = (await q(`SELECT [StatoAttività] AS s FROM dbo.[Brighetti_Attività] WHERE [IdAttività] = @id`, { id: f1 }))[0].s
  check(s === 2, 'stato In_Lavorazione', s)
  const c2 = await oper.post(`/api/attivita/${f1}/concludi`, { QuantitaProdotta: 4, QuantitaScartata: 1 })
  check(c2.data.ok && /parziale/i.test(c2.data.message), 'quantità parziale: fase resta aperta', c2.data)
  s = (await q(`SELECT [StatoAttività] AS s FROM dbo.[Brighetti_Attività] WHERE [IdAttività] = @id`, { id: f1 }))[0].s
  check(s === 0, 'stato tornato In attesa', s)
  check((await oper.post(`/api/attivita/${f1}/apri`, { StatoAttivita: 1 })).data.ok, 'riapre in lavorazione')
  const sosp = await oper.post(`/api/attivita/${f1}/sospendi`, { QuantitaProdotta: 6, QuantitaScartata: 1 })
  check(sosp.data.ok, 'sospende attività')
  check((await oper.post(`/api/attivita/${f1}/apri`, { StatoAttivita: 1 })).data.ok, 'riprende attività sospesa')
  const c3 = await oper.post(`/api/attivita/${f1}/concludi`, { QuantitaProdotta: 10, QuantitaScartata: 1 })
  check(c3.data.ok && c3.data.message === 'Attività conclusa correttamente', 'conclude fase 1 (10/10)', c3.data)
  const dopo1 = await q(`SELECT IncrementaleProcedura AS inc, [StatoAttività] AS s, CAST([QuantitàProdotta] AS FLOAT) AS p FROM dbo.[Brighetti_Attività] WHERE OrdineDiProduzione = @o AND CodiceArticolo = @c ORDER BY [IdAttività]`, { o: odp.data.odp, c: codice })
  check(dopo1[0].s === 4 && dopo1[1].s === 4 && dopo1[1].p === 10 && dopo1[2].s === 0 && dopo1[3].s === 99, 'fase 1 e versamento chiusi, fase 3 sbloccata', dopo1.map((a) => a.s))
  const tempi = await q(`SELECT [TipoAttività] AS t FROM dbo.Brighetti_Tempi WHERE [IdAttività] = @id ORDER BY IdTempo`, { id: f1 })
  check(tempi.length === 4 && tempi[0].t === 0 && tempi.slice(1).every((t) => t.t === 1), 'tempi registrati (1 attrezzaggio + 3 lavorazione)', tempi)
  const magFres = (await q(`SELECT Id FROM dbo.Brighetti_Magazzini WHERE CodiceMagazzino = N'Magazzino Fresatura'`))[0].Id
  const magTT = (await q(`SELECT Id FROM dbo.Brighetti_Magazzini WHERE CodiceMagazzino = N'Magazzino Tratt. Termico'`))[0].Id
  let gF = await q(`SELECT Id, CAST([QuantitàGiacenza] AS FLOAT) AS g FROM dbo.Brighetti_Giacenze WHERE CodiceArticolo = @c AND CodiceMagazzino = @m`, { c: codice, m: String(magFres) })
  check(gF.length === 1 && gF[0].g === 10, 'giacenza caricata in Magazzino Fresatura (10)', gF)
  const det1 = await q(`SELECT COUNT(*) AS n FROM dbo.Brighetti_DettagliGiacenza WHERE Brighetti_Giacenza_Id = @g`, { g: gF[0]?.Id ?? 0 })
  check(det1[0].n === 1, 'dettaglio giacenza creato')
  const lotto = await q(`SELECT l.IdLotto, la.NomeArticolo, la.[QuantitàArticolo] AS q FROM dbo.Brighetti_Lotti l JOIN dbo.Brighetti_Lotti_Articoli la ON la.IdLotto = l.IdLotto WHERE l.NomeLotto LIKE @n`, { n: `AUTO ${codice}%` })
  check(lotto.length === 1 && lotto[0].q === '10', 'lotto automatico creato alla chiusura fase', lotto)

  // Fase 3 (Fresatura, macchina diversa): l'admin puo' operare; deve scaricare Fresatura e caricare Tratt. Termico.
  const f3 = att[2].id
  check((await oper.post(`/api/attivita/${f3}/apri`, { StatoAttivita: 1 })).status === 403, 'operatore non può operare su un’altra macchina')
  check((await admin.post(`/api/attivita/${f3}/apri`, { StatoAttivita: 1 })).data.ok, 'admin avvia fase 3')
  const c4 = await admin.post(`/api/attivita/${f3}/concludi`, { QuantitaProdotta: 10, QuantitaScartata: 0 })
  check(c4.data.ok, 'conclude fase 3 (scarico/carico tra magazzini)', c4.data)
  gF = await q(`SELECT CAST([QuantitàGiacenza] AS FLOAT) AS g FROM dbo.Brighetti_Giacenze WHERE CodiceArticolo = @c AND CodiceMagazzino = @m`, { c: codice, m: String(magFres) })
  const gT = await q(`SELECT CAST([QuantitàGiacenza] AS FLOAT) AS g FROM dbo.Brighetti_Giacenze WHERE CodiceArticolo = @c AND CodiceMagazzino = @m`, { c: codice, m: String(magTT) })
  check(gF[0].g === 0 && gT.length === 1 && gT[0].g === 10, 'Fresatura scaricata (0), Tratt. Termico caricato (10)', { gF, gT })
  const det2 = await q(`SELECT COUNT(*) AS n FROM dbo.Brighetti_DettagliGiacenza d JOIN dbo.Brighetti_Giacenze g ON g.Id = d.Brighetti_Giacenza_Id WHERE g.CodiceArticolo = @c AND g.CodiceMagazzino = @m`, { c: codice, m: String(magFres) })
  check(det2[0].n === 0, 'dettaglio giacenza precedente rimosso')
  const dopo3 = await q(`SELECT [StatoAttività] AS s FROM dbo.[Brighetti_Attività] WHERE OrdineDiProduzione = @o AND CodiceArticolo = @c ORDER BY [IdAttività]`, { o: odp.data.odp, c: codice })
  check(dopo3[2].s === 4 && dopo3[3].s === 4 && dopo3[4].s === 0, 'fase 5 sbloccata', dopo3.map((a) => a.s))
  const mo = await admin.get(`/api/odp?ordine=${encodeURIComponent(odp.data.odp)}`)
  check(mo.data.ok && mo.data.fasi.length === 5 && mo.data.fasi[0].TempoLavorazione >= 0 && mo.data.fasi[0].PercCompletamento === 40, 'dettaglio ODP (5 lavorazioni, 40% completato)', mo.data.fasi?.[0])
  const conc = await admin.post(`/api/attivita/${f3}/concludi`, { QuantitaProdotta: 1, QuantitaScartata: 0 })
  check(!conc.data.ok && /stato attuale: Completato/.test(conc.data.message), 'non si può concludere due volte')

  console.log('\n[5] Lotti: modifica, Ritornato (sblocco ambiguo), Excel')
  const idLotto = lotto[0].IdLotto
  const tr = await toggleId('lotti.ritornato_sblocca_fase_abilitato')
  if (tr.Valore !== 'true') await admin.post(`/api/impostazioni/${tr.Id}/toggle`)
  const dl = await admin.get(`/api/lotti/${idLotto}`)
  check(dl.data.ok && dl.data.articoli.length === 1, 'dettaglio lotto')
  const art0 = dl.data.articoli[0]
  const ml = await admin.put(`/api/lotti/${idLotto}`, { ...dl.data.lotto, CodiceADLACL: 'ADL-1', StatoLotto: 2, Articoli: [{ ...art0, QuantitaArticolo: '9', StatoArticoloLotto: 2, NoteArticolo: 'ok' }] })
  check(ml.data.ok, 'lotto -> Ritornato', ml.data)
  const la2 = await q(`SELECT [QuantitàArticolo] AS q, StatoArticoloLotto AS s FROM dbo.Brighetti_Lotti_Articoli WHERE IdLotto = @id`, { id: idLotto })
  check(la2[0].q === '9' && la2[0].s === 2, 'righe articolo del lotto aggiornate')
  const warn = await q(`SELECT TOP 1 Messaggio FROM dbo.[Log] WHERE Indirizzo = N'LottiAutomaticiService/SbloccaFaseDaLottoRitornato' ORDER BY Id DESC`)
  check(warn.length === 1 && /non univoco/.test(warn[0].Messaggio), 'sblocco ambiguo annotato nel Log (nessuno sblocco)')
  const xl = await admin.get(`/api/lotti/${idLotto}/excel`, { raw: true })
  check(xl.status === 200 && (xl.headers.get('content-type') || '').includes('spreadsheetml') && xl.data.length > 5000 && xl.data.subarray(0, 2).toString() === 'PK', 'export Excel lotto dal template', xl.status)
  const nl = await admin.post('/api/lotti', { NomeLotto: `L-${TAG}`, DescrizioneLotto: 'manuale' })
  check(nl.data.ok, 'crea lotto manuale')
  check((await admin.del(`/api/lotti/${nl.data.id}`)).data.ok, 'elimina lotto')

  console.log('\n[6] Giacenze, riordino automatico, ordini')
  const magFin = (await q(`SELECT Id FROM dbo.Brighetti_Magazzini WHERE CodiceMagazzino = N'Magazzino Finito'`))[0].Id
  const cg = await admin.post('/api/giacenze', { IdArticolo: String(idArt), IdMagazzino: String(magFin), QuantitaGiacenza: 5, QuantitaSottoscorta: 20, QuantitaScortaMassima: 0 })
  check(cg.data.ok, 'crea giacenza sotto scorta')
  const gsaved = await q(`SELECT CodiceArticolo FROM dbo.Brighetti_Giacenze WHERE Id = @id`, { id: cg.data.id })
  check(gsaved[0].CodiceArticolo === codice, 'giacenza salvata con il CODICE articolo (non Id)')
  const lg = await admin.get(`/api/giacenze?magazzino=${magFin}&search=${encodeURIComponent(codice)}`)
  check(lg.data.ok && lg.data.recordsFiltered === 1 && lg.data.data[0].Magazzino === 'Magazzino Finito', 'elenco giacenze filtrato per magazzino', lg.data)
  const tp = await toggleId('ordini_automatici.prefissi_codice')
  await admin.put('/api/impostazioni', { valori: { [tp.Id]: 'G8' } })
  const gen = await admin.post('/api/ordini-automatici/genera')
  check(gen.data.ok && gen.data.esito.Generate >= 1, 'genera proposte di riordino', gen.data)
  const prop = await q(`SELECT Id, CAST([QuantitàProposta] AS FLOAT) AS q, Stato FROM dbo.Brighetti_OrdiniAutomatici WHERE CodiceArticolo = @c AND CodiceMagazzino = @m`, { c: codice, m: String(magFin) })
  check(prop.length === 1 && prop[0].q === 50 && prop[0].Stato === 0, 'proposta: (2x20-5)=35 arrotondato al lotto 25 -> 50', prop)
  const totPrima = (await q(`SELECT COUNT(*) AS n FROM dbo.Brighetti_OrdiniAutomatici WHERE CodiceArticolo = @c`, { c: codice }))[0].n
  const gen2 = await admin.post('/api/ordini-automatici/genera')
  const prop2 = await q(`SELECT COUNT(*) AS n FROM dbo.Brighetti_OrdiniAutomatici WHERE CodiceArticolo = @c AND CodiceMagazzino = @m`, { c: codice, m: String(magFin) })
  const totDopo = (await q(`SELECT COUNT(*) AS n FROM dbo.Brighetti_OrdiniAutomatici WHERE CodiceArticolo = @c`, { c: codice }))[0].n
  check(gen2.data.ok && prop2[0].n === 1 && totDopo === totPrima, 'nessun doppione alla seconda generazione', { prop2, totPrima, totDopo })
  check((await admin.post(`/api/ordini-automatici/${prop[0].Id}`, { azione: 'evaso' })).data.ok === false, 'evaso non consentito su proposta non confermata')
  check((await admin.post(`/api/ordini-automatici/${prop[0].Id}`, { azione: 'conferma' })).data.ok, 'conferma proposta')
  check((await admin.post(`/api/ordini-automatici/${prop[0].Id}`, { azione: 'evaso' })).data.ok, 'segna evaso')
  const cru = await admin.get('/cruscotto')
  check(cru.status === 200 && cru.data.includes('Centro di Controllo'), 'cruscotto')
  const lm = await admin.post('/api/impostazioni/lotto-minimo', { prefisso: codice, valore: 30 })
  check(lm.data.ok && /^1 articoli/.test(lm.data.message), 'lotto minimo di massa per prefisso', lm.data)

  console.log('\n[7] Sincronizzazione Mexal (import CSV)')
  const fd = new FormData()
  fd.append('file', new Blob([`Articolo;Magazzino;Giacenza\n${codice};${magFin};123,5\nNUOVO-${TAG};${magFin};7\n`], { type: 'text/csv' }), 'giacenze.csv')
  const imx = await admin.req('POST', '/api/sync-mexal/importa', fd)
  check(imx.data.ok && imx.data.esito.Aggiornate === 1 && imx.data.esito.Create === 1, 'import CSV: 1 aggiornata, 1 creata', imx.data)
  const gm = await q(`SELECT CAST([QuantitàGiacenza] AS FLOAT) AS g FROM dbo.Brighetti_Giacenze WHERE Id = @id`, { id: cg.data.id })
  check(gm[0].g === 123.5, 'quantità con virgola decimale italiana (123,5)')
  const ex = await admin.post('/api/sync-mexal/esegui')
  check(ex.data.ok === false && /non configurato/.test(ex.data.message), 'sync da file non configurato -> errore gestito')
  check((await admin.del(`/api/giacenze/${cg.data.id}`)).data.ok, 'elimina giacenza')

  console.log('\n[8] Note e documenti')
  const nota = await oper.post('/api/note', { Id: mac.IdMacchina, Nota: `Nota ${TAG}`, Type: 6 })
  check(nota.data.ok, 'operatore aggiunge nota macchina')
  const idNota = (await q(`SELECT TOP 1 Id FROM dbo.Brighetti_Note WHERE Contenuto_Nota = @n`, { n: `Nota ${TAG}` }))[0].Id
  const fdoc = new FormData()
  const contenuto = `documento di prova ${TAG}`
  fdoc.append('id', String(mac.IdMacchina))
  fdoc.append('Type', '6')
  fdoc.append('file', new Blob([contenuto], { type: 'text/plain' }), `scheda tecnica ${TAG}.txt`)
  const up = await oper.req('POST', '/api/documenti', fdoc)
  check(up.data.ok, 'upload documento', up.data)
  const doc = (await q(`SELECT TOP 1 Id, Nome_File, Percorso_File FROM dbo.Brighetti_Documenti WHERE Nome_File = @n`, { n: `scheda tecnica ${TAG}.txt` }))[0]
  const dn = await admin.get(`/api/documenti/${doc.Id}`, { raw: true })
  check(dn.status === 200 && dn.data.toString() === contenuto && (dn.headers.get('content-disposition') || '').includes('attachment'), 'download documento identico')
  const ist = await admin.get(`/macchine/${mac.IdMacchina}`)
  check(ist.data.includes(`Nota ${TAG}`) && ist.data.includes(`scheda tecnica ${TAG}.txt`), 'scheda macchina mostra nota e documento')
  check((await oper.del(`/api/documenti/${doc.Id}`)).data.ok, 'elimina documento')
  check((await oper.del(`/api/note/${idNota}`)).data.ok, 'elimina nota')

  console.log('\n[9] Planimetria e dati macchina')
  const liberi = await admin.get('/api/planimetria')
  check(liberi.data.ok && liberi.data.listaMacchine.length > 0, 'macchine senza pin')
  const libera = liberi.data.listaMacchine[0].IdMacchina
  check((await admin.post('/api/planimetria', { id: libera, posX: '10.5', posY: '20.25' })).data.ok, 'aggiunge pin')
  check((await admin.post('/api/planimetria', { id: libera, posX: '1', posY: '1' })).status === 409, 'pin duplicato rifiutato')
  const dm = await admin.get(`/api/macchine/${mac.IdMacchina}/dati`)
  check(dm.data.ok && dm.data.programmaDesc === 'BROCCIA G8 - SGROSSATURA', 'dati MTConnect per il popover', dm.data)
  check((await admin.del(`/api/planimetria/${libera}`)).data.ok, 'rimuove pin')
  check((await oper.post('/api/planimetria', { id: libera, posX: '1', posY: '1' })).status === 403, 'operatore non modifica la planimetria')
  const an = await admin.get(`/macchine/${mac.IdMacchina}/analisi?periodo=20200101-20991231`)
  check(an.status === 200 && an.data.includes(codice), 'analisi macchina con produzione nel periodo')

  console.log('\n[10] Utenti, password, sicurezza')
  const nu = await admin.post('/api/utenti', { username: `u${TAG}`, email: '', password: 'Prova.123', ruolo: 'Operatore' })
  check(nu.data.ok, 'crea utente', nu.data)
  const weak = await admin.post('/api/utenti', { username: `w${TAG}`, password: 'debole', ruolo: 'Operatore' })
  check(!weak.data.ok, 'password debole rifiutata')
  const nuovo = new Client('nuovo')
  check((await nuovo.login({ username: `U${TAG}`, password: 'Prova.123' })).data.ok, 'login nuovo utente (username case-insensitive)')
  const np = await nuovo.get('/operatore')
  check(np.status === 200 && np.data.includes('Nessuna macchina associata'), 'operatore senza macchina: messaggio dedicato')
  check((await admin.patch(`/api/utenti/${nu.data.id}`, { password: 'Nuova.456' })).data.ok, 'reset password da admin')
  check((await nuovo.get('/api/opzioni?tipo=reparti')).status === 401, 'sessione invalidata dopo reset password')
  check((await nuovo.login({ username: `u${TAG}`, password: 'Nuova.456' })).data.ok, 'login con nuova password')
  const cp = await nuovo.post('/api/auth/password', { oldPassword: 'Nuova.456', newPassword: 'Terza.789', confirmPassword: 'Terza.789' })
  check(cp.data.ok, 'cambio password utente', cp.data)
  check((await nuovo.get('/account')).status === 200, 'sessione mantenuta dopo il proprio cambio password')
  const bruto = new Client('bruto')
  for (let i = 0; i < 5; i++) await bruto.login({ username: `u${TAG}`, password: `errata${i}` })
  const bloccato = await bruto.login({ username: `u${TAG}`, password: 'Terza.789' })
  check(!bloccato.data.ok && /bloccato/i.test(bloccato.data.message), 'account bloccato dopo 5 tentativi errati', bloccato.data)
  check((await admin.del(`/api/utenti/${nu.data.id}`)).data.ok, 'cancella utente')
  const me = (await q(`SELECT Id FROM dbo.AspNetUsers WHERE UserName = N'admin'`))[0].Id
  check((await admin.del(`/api/utenti/${me}`)).status === 400, 'admin non può cancellare sé stesso')
  const cross = await admin.post('/api/reparti', { NomeReparto: 'x' }, { headers: { origin: 'https://sito-malevolo.example' } })
  check(cross.status === 403, 'richiesta da origine esterna bloccata (CSRF)')
  const cron = await anon.post('/api/cron/ordini-automatici', {}, { headers: { authorization: 'Bearer sbagliato' } })
  check(cron.status === 401, 'cron senza token corretto -> 401')
  if (process.env.CRON_SECRET) {
    const cronOk = await anon.post('/api/cron/ordini-automatici', {}, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    check(cronOk.status === 200 && cronOk.data.ok, 'cron con token -> job eseguito (rispetta interruttore)', cronOk.data)
  }
  const audit = await q(`SELECT COUNT(*) AS n FROM dbo.Audit WHERE Messaggio LIKE @m`, { m: `%${codice}%` })
  check(audit[0].n >= 3, 'operazioni tracciate in Audit')
  check((await admin.post('/api/auth/logout')).status === 200, 'logout')
}

try {
  await main()
} catch (e) {
  failures.push(`eccezione: ${e.message}`)
  console.error(e)
} finally {
  await pool.close()
}
console.log(`\n${passed} verifiche superate, ${failures.length} fallite`)
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
