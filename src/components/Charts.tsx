'use client'

import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const VERDE = 'rgba(46, 191, 0, 0.79)'
const ROSSO = 'rgba(255, 35, 0, 0.79)'

/** Grafico efficienza a barre impilate (in attivita' / in fermo) come nella vecchia Analisi. */
export function GraficoEfficienza({ dati }: { dati: { Data: string; PercEfficienza: number; PercTotale: number }[] }) {
  if (dati.length === 0) return <div className="text-muted p-3">Macchina non collegata: nessun dato di efficienza.</div>
  return (
    <Bar
      data={{
        labels: dati.map((d) => d.Data),
        datasets: [
          { label: 'In attività', data: dati.map((d) => d.PercEfficienza), backgroundColor: VERDE, borderColor: VERDE, borderWidth: 1 },
          { label: 'In fermo', data: dati.map((d) => d.PercTotale), backgroundColor: ROSSO, borderColor: ROSSO, borderWidth: 1 },
        ],
      }}
      options={{
        responsive: true,
        plugins: { legend: { display: true, position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y}%` } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, display: false } },
      }}
    />
  )
}

const PALETTE = ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 206, 86, 1)', 'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)', 'rgba(255, 159, 64, 1)']

/** Torta degli stati di esecuzione (vecchia Istanza macchina). */
export function GraficoStati({ dati }: { dati: { Stato: string | null; Number: number }[] }) {
  return (
    <Pie
      data={{
        labels: dati.map((d) => d.Stato ?? '-'),
        datasets: [{ label: 'Stato Macchina', data: dati.map((d) => d.Number), backgroundColor: PALETTE, borderColor: PALETTE, borderWidth: 1 }],
      }}
      options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }}
    />
  )
}
