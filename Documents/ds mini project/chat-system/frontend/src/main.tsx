import React from 'react'
import { createRoot } from 'react-dom/client'
import { io } from 'socket.io-client'

const App: React.FC = () => {
  const [route, setRoute] = React.useState<{ serverId: string; http: string; ws: string } | null>(null)
  const [status, setStatus] = React.useState('idle')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const base = ''
    fetch(`${base}/route`).then(async (r) => {
      const data = await r.json()
      setRoute(data)
      const s = io(data.ws, { transports: ['websocket'] })
      s.on('connect', () => { setStatus('connected'); setError(null) })
      s.on('connect_error', (e: any) => { setStatus('connect_error'); setError(String(e?.message || e)) })
      s.on('error', (e: any) => { setStatus('error'); setError(String(e?.message || e)) })
      s.on('disconnect', () => setStatus('disconnected'))
    }).catch((e) => { setStatus('error'); setError(String(e?.message || e)) })
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>Chat Frontend</h1>
      <div>Status: {status}</div>
      {error && <div style={{color:'red'}}>Error: {error}</div>}
      <pre>{JSON.stringify(route, null, 2)}</pre>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

