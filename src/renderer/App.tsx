import { useState, useEffect } from 'react'
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
    // Check USB connection on mount
    checkUSB()
  }, [])

  const checkUSB = async () => {
    try {
      const result = await window.electron.detectUsbDevice()
      setUsbConnected(result.connected)
    } catch (error) {
      console.error('USB detection error:', error)
    }
  }

  const handleFittrackeeLogin = async () => {
    // TODO: Implement OAuth login modal
    setFittrackeeConnected(true)
  }

  const syncWorkouts = async () => {
    if (!fittrackeeConnected || !usbConnected) return
    
    setSyncing(true)
    try {
      const result = await window.electron.syncWorkouts()
      alert(`✅ ${result.synced} entrenamendu sinkronizatu dira!`)
    } catch (error) {
      alert('❌ Sinkronizazio errorea: ' + error)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
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
              <button
                onClick={handleFittrackeeLogin}
                disabled={fittrackeeConnected}
                className={`w-full p-3 rounded-lg font-medium transition-all ${
                  fittrackeeConnected
                    ? 'bg-green-500/20 text-green-400 cursor-default'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {fittrackeeConnected ? '✓ Fittrackee Connected' : '🔐 Login with Fittrackee'}
              </button>
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
