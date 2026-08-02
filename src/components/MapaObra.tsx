import React, { useEffect, useRef } from 'react'

interface Props {
  latitude: number
  longitude: number
  nome: string
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

let leafletPromise: Promise<any> | null = null

function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject()
  if ((window as any).L) return Promise.resolve((window as any).L)
  if (leafletPromise) return leafletPromise

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.onload = () => resolve((window as any).L)
    script.onerror = reject
    document.head.appendChild(script)
  })
  return leafletPromise
}

export function MapaObra({ latitude, longitude, nome }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    let cancelado = false

    loadLeaflet().then(L => {
      if (cancelado || !containerRef.current || mapRef.current) return

      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
      }).setView([latitude, longitude], 15)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map)

      L.circleMarker([latitude, longitude], {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: '#2a78d6',
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup(nome)

      mapRef.current = map
    }).catch(() => { /* sem rede / bloqueado — apenas não mostra o mapa */ })

    return () => {
      cancelado = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [latitude, longitude, nome])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 280,
        borderRadius: 12,
        overflow: 'hidden',
        border: '0.5px solid var(--border)',
        zIndex: 0,
      }}
    />
  )
}
