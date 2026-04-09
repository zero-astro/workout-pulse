import { useState, useEffect } from 'react'
import { ipcRenderer } from 'electron'
import './index.css'

interface WorkoutSummary {
  id: number
  type: string
  duration: string
  date: string
}

function App() {
  const [usbConnected, setUsbConnected] = useState(false)
  const [fittrackeeConnected, setFittrackeeConnected] = useState(false)
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSummary[]>([])
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    // Check USB and auth status on mount
    checkUSB()
    fetchRecentWorkouts()
    
    // Listen for USB events
    ipcRenderer.on('usb-connected', () => {
      setUsbConnected(true)
    })
    
    return () => {
      ipcRenderer.removeAllListeners('usb-connected')
    }
  }, [])

  const checkUSB = async () => {
    try {
      const result = await window.electron.detectUsbDevice()
      setUsbConnected(result.connected)
    } catch (error) {
      console.error('USB detection error:', error)
    }
  }

  const [authUrl, setAuthUrl] = useState<string>('')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')

  const handleFittrackeeLogin = async () => {
    // Check if already authenticated
    const authStatus = await ipcRenderer.invoke('fittrackee-check-auth')
    
    if (authStatus.authenticated) {
      setFittrackeeConnected(true)
      return
    }

    // Open OAuth flow modal
    setShowAuthModal(true)
  }

  const syncWorkouts = async () => {
    if (!fittrackeeConnected || !usbConnected) return
    
    setSyncing(true)
    try {
      const result = await ipcRenderer.invoke('sync-workouts')
      
      if (result.success) {
        alert(`✅ ${result.synced} entrenamendu sinkronizatu dira!`)
        // Refresh recent workouts
        fetchRecentWorkouts()
      } else {
        alert(`❌ Error: ${result.error}`)
      }
    } catch (error) {
      alert('❌ Sinkronizazio errorea: ' + error)
    } finally {
      setSyncing(false)
    }
  }

  const fetchRecentWorkouts = async () => {
    try {
      const result = await ipcRenderer.invoke('fittrackee-get-recent-workouts', 10)
      if (result.success) {
        const workouts = result.workouts.map((w: any) => ({
          id: w.uuid,
          type: w.activity_type_id === 1 ? 'Run' : 
                w.activity_type_id === 2 ? 'Ride' :
                w.activity_type_id === 3 ? 'Walk' : 'Other',
          duration: `${Math.round(w.moving_time / 60)} min`,
          date: new Date(w.start_datetime).toLocaleDateString()
        }))
        setRecentWorkouts(workouts)
      }
    } catch (error) {
      console.error('Error fetching recent workouts:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* OAuth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">🔐 Fittrackee Authentication</h3>
            
            {!authUrl ? (
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full p-3 bg-black/20 rounded-lg border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <input
                  type="password"
                  placeholder="Client Secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="w-full p-3 bg-black/20 rounded-lg border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={async () => {
                    const result = await ipcRenderer.invoke('fittrackee-set-credentials', clientId, clientSecret)
                    if (result.success) {
                      const authResult = await ipcRenderer.invoke('fittrackee-get-auth-url')
                      setAuthUrl(authResult.authUrl)
                    }
                  }}
                  className="w-full p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
                >
                  Continue
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-300 text-sm">Open this URL in your browser:</p>
                <a 
                  href={authUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block p-3 bg-black/20 rounded-lg text-purple-400 break-all hover:bg-black/30 transition-colors"
                >
                  {authUrl}
                </a>
                <p className="text-gray-400 text-xs">After authorizing, click "Authorize" below</p>
                
                <input
                  type="text"
                  id="auth-code"
                  placeholder="Authorization code (from callback URL)"
                  ref={(el) => {
                    if (el) el.focus()
                  }}
                      className="w-full p-3 bg-black/20 rounded-lg border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={async () => {
                    const code = (document.getElementById('auth-code') as HTMLInputElement)?.value || ''
                    if (!code) {
                      alert('Please enter the authorization code')
                      return
                    }
                    const result = await ipcRenderer.invoke('fittrackee-exchange-code', code)
                    if (result.success) {
                      setFittrackeeConnected(true)
                      setShowAuthModal(false)
                      fetchRecentWorkouts()
                    } else {
                      alert('Error: ' + result.error)
                    }
                  }}
                  className="w-full p-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                >
                  Authorize
                </button>
              </div>
            )}
            
            <button
              onClick={() => { setShowAuthModal(false); setAuthUrl('') }}
              className="w-full mt-4 p-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            ⚡ WorkoutPulse
          </h1>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${usbConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {usbConnected ? '⌚ USB Connected' : '⏳ No Watch'}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${fittrackeeConnected ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
              {fittrackeeConnected ? '🎯 Fittrackee Connected' : '🔐 Not Logged In'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Connection Status */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <h2 className="text-lg font-semibold text-purple-300 mb-4">📡 Connection Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                <span>Smartwatch USB</span>
                {usbConnected ? (
                  <span className="text-green-400 text-sm font-medium">✓ Connected</span>
                ) : (
                  <span className="text-gray-400 text-sm">Waiting...</span>
                )}
              </div>
              
              {!fittrackeeConnected ? (
                <button
                  onClick={handleFittrackeeLogin}
                  className="w-full p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-all"
                >
                  🔐 Login with Fittrackee
                </button>
              ) : (
                <div className="p-3 bg-green-500/20 rounded-lg border border-green-500/30">
                  <span className="text-green-400 text-sm font-medium">✓ Fittrackee Connected</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <h2 className="text-lg font-semibold text-purple-300 mb-4">🔄 Quick Actions</h2>
            <button
              onClick={syncWorkouts}
              disabled={!usbConnected || !fittrackeeConnected || syncing}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                !usbConnected || !fittrackeeConnected || syncing
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-500/25'
              }`}
            >
              {syncing ? '⚡ Syncing...' : '📥 Sync Workouts Now'}
            </button>
          </div>
        </section>

        {/* Recent Workouts */}
        <section className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
          <h2 className="text-lg font-semibold text-purple-300 mb-4">📊 Recent Workouts</h2>
          
          {recentWorkouts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No recent workouts found. Connect your watch and sync!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentWorkouts.map((workout) => (
                <div key={workout.id} className="flex items-center justify-between p-4 bg-black/20 rounded-lg hover:bg-white/5 transition-colors">
                  <div>
                    <h3 className="font-medium text-white">{workout.type}</h3>
                    <p className="text-sm text-gray-400">{workout.date}</p>
                  </div>
                  <span className="text-purple-300 font-mono">{workout.duration}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-500 text-sm">
        WorkoutPulse • Sync your fitness journey 🚀
      </footer>
    </div>
  )
}

export default App
