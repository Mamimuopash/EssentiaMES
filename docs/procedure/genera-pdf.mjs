#!/usr/bin/env node
/*
 * Genera i manuali PDF di EssentiaMES da docs/procedure/*.html (stampa con Chromium/Playwright).
 * I PDF vanno in public/manuali/ e si aprono dall'app (pagina Account).
 *
 *   node docs/procedure/genera-pdf.mjs
 *
 * Gli screenshot sono in docs/procedure/img/ (presi dall'app con dati dimostrativi).
 * Richiede Playwright con Chromium (npx playwright install chromium se manca).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright')
const qui = path.dirname(fileURLToPath(import.meta.url))
const uscita = path.resolve(qui, '../../public/manuali')
fs.mkdirSync(uscita, { recursive: true })

const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const oggi = new Date()
const data = process.env.DATA_MANUALI || `${mesi[oggi.getMonth()]} ${oggi.getFullYear()}`

const manuali = [
  { sorgente: 'operatore.html', pdf: 'procedure-operatore.pdf', titolo: 'Procedure operatore', piede: true },
  { sorgente: 'responsabile.html', pdf: 'procedure-responsabile.pdf', titolo: 'Procedure responsabile', piede: true },
  { sorgente: 'scheda-rapida.html', pdf: 'scheda-rapida-operatore.pdf', titolo: 'Scheda rapida operatore', piede: false },
]

const browser = await chromium.launch()
try {
  for (const m of manuali) {
    // {{DATA}} -> data della versione; il file temporaneo sta nella stessa cartella (percorsi relativi delle immagini).
    const html = fs.readFileSync(path.join(qui, m.sorgente), 'utf8').replaceAll('{{DATA}}', data)
    const temp = path.join(qui, `.${m.sorgente}.tmp.html`)
    fs.writeFileSync(temp, html)
    try {
      const page = await browser.newPage()
      await page.goto(pathToFileURL(temp).href, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      const piede = `<div style="width:100%;font-family:Arial,sans-serif;font-size:7.5pt;color:#8a90a0;padding:0 15mm;display:flex;justify-content:space-between">
        <span>EssentiaMES · ${m.titolo} · ${data}</span><span>pagina <span class="pageNumber"></span> di <span class="totalPages"></span></span></div>`
      await page.pdf({
        path: path.join(uscita, m.pdf),
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: m.piede,
        headerTemplate: '<span></span>',
        footerTemplate: m.piede ? piede : '<span></span>',
      })
      await page.close()
      console.log(`${m.pdf}  (${Math.round(fs.statSync(path.join(uscita, m.pdf)).size / 1024)} KB)`)
    } finally {
      fs.rmSync(temp, { force: true })
    }
  }
} finally {
  await browser.close()
}
