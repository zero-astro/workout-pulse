import { useState, useEffect } from 'react'
import { ipcRenderer } from 'electron'

interface LocalWorkout {
  id: string
  type: string
  deviceName?: string
  startTime: number
  endTime: number
  duration: number
  distance?: number
  elevationGain?: number
  calories?: number
  avgHeartRate?: number
  maxHeartRate?: number
  syncedAt?: number
}

interface DashboardStats {
  total: number
  synced: number
  unsynced: number
  byType: Record<string, number>
}

export function Dashboard() {
  const [usbConnected, setUsbConnected] = useState(false)
  const [usbConnecting, setUsbConnecting] = useState(false)
  const [fittrackeeConnected, setFittrackeeConnected] = useState(false)
  const [localWorkouts, setLocalWorkouts] = useState<LocalWorkout[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'unsynced'>('all')

  useEffect(() => {
    checkStatus()
    setUsbConnecting(true)
    
    // Listen for USB events
    const handleUsbConnected = () => {
      setUsbConnecting(false)
      setUsbConnected(true)
    }
    const handleUsbDisconnected = () => {
      setUsbConnecting(false)
      setUsbConnected(false)
    }
    
    ipcRenderer.on('usb-connected', handleUsbConnected)
    ipcRenderer.on('usb-disconnected', handleUsbDisconnected)
    
    return () => {
      ipcRenderer.removeAllListeners('usb-connected')
      ipcRenderer.removeAllListeners('usb-disconnected')
    }
  }, [])

  const checkStatus = async () => {
    try {
      const [usbResult, authResult] = await Promise.all([
        window.electron.detectUsbDevice(),
        ipcRenderer.invoke('fittrackee-check-auth')
      ])
      
      setUsbConnected(usbResult.connected)
      setFittrackeeConnected(authResult.authenticated)
    } catch (error) {
      console.error('Status check error:', error)
    }
  }

  const fetchLocalData = async () => {
    try {
      const [workouts, statsResult] = await Promise.all([
        window.electron.getLocalWorkouts(),
        window.electron.getWorkoutStatistics()
      ])
      
      setLocalWorkouts(workouts.workouts || [])
      if (statsResult.success) {
        setStats(statsResult)
      }
    } catch (error) {
      console.error('Fetch local data error:', error)
    }
  }

  useEffect(() => {
    fetchLocalData()
  }, [activeTab])

  const handleSync = async () => {
    if (!fittrackeeConnected || !usbConnected) return
    
    setSyncing(true)
    try {
      const result = await window.electron.syncWorkouts()
      
      if (result.success) {
        alert(`✅ ${result.synced} entrenamendu sinkronizatu dira!`)
        fetchLocalData()
      } else {
        alert(`❌ Error: ${result.error}`)
      }
    } catch (error) {
      alert('❌ Sinkronizazio errorea: ' + error)
    } finally {
      setSyncing(false)
    }
  }

  const filteredWorkouts = activeTab === 'all' 
    ? localWorkouts 
    : localWorkouts.filter(w => !w.syncedAt)

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    return `${mins} min`
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('eu-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getActivityIcon = (type: string) => {
    switch(type.toLowerCase()) {
      case 'run': return '🏃'
      case 'ride': return '🚴'
      case 'walk': return '🚶'
      case 'hike': return '⛰️'
      case 'swim': return '🏊'
      default: return '💪'
    }
  }

  const getActivityLabel = (type: string) => {
    const labels: Record<string, string> = {
      Run: 'Eskubidea',
      Ride: 'Bikea',
      Walk: 'Oinez',
      Hike: 'Ibilaldia',
      Swim: 'Norbere burua'
    }
    return labels[type] || type
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-lg border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            ⚡ WorkoutPulse
          </h1>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              usbConnecting ? 'bg-yellow-500/20 text-yellow-400 animate-pulse' :
              usbConnected ? 'bg-green-500/20 text-green-400 shadow-lg shadow-green-500/30' : 
              'bg-red-500/20 text-red-400'
            }`}>
              {usbConnecting ? (
                <>
                  <span className="animate-spin">🔄</span> Detecting...
                </>
              ) : usbConnected ? (
                <>
                  <span className="animate-pulse">⚡</span> USB Connected
                </>
              ) : (
                '⏳ No Watch'
              )}
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${fittrackeeConnected ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>
              {fittrackeeConnected ? '🎯 Fittrackee Connected' : '🔐 Not Logged In'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        {stats && (
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white/5 backdrop-blur-lg rounded-xl p-4 border border-white/10">
              <p className="text-gray-400 text-sm mb-1">Total Workouts</p>
              <p className="text-3xl font-bold text-white">{stats.total}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-lg rounded-xl p-4 border border-white/10">
              <p className="text-gray-400 text-sm mb-1">Synced</p>
              <p className="text-3xl font-bold text-green-400">{stats.synced}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-lg rounded-xl p-4 border border-white/10">
              <p className="text-gray-400 text-sm mb-1">Unsynced</p>
              <p className="text-3xl font-bold text-yellow-400">{stats.unsynced}</p>
            </div>
            <div className="bg-white/5 backdrop-blur-lg rounded-xl p-4 border border-white/10">
              <p className="text-gray-400 text-sm mb-1">Activity Types</p>
              <p className="text-2xl font-bold text-purple-400">{Object.keys(stats.byType).length}</p>
            </div>
          </section>
        )}

        {/* Connection & Actions */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <h2 className="text-lg font-semibold text-purple-300 mb-4">📡 Connection Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <span>Smartwatch USB</span>
                  {usbConnecting && (
                    <span className="animate-spin text-yellow-400">🔄</span>
                  )}
                </div>
                {usbConnecting ? (
                  <span className="text-yellow-400 text-sm font-medium animate-pulse">Detecting...</span>
                ) : usbConnected ? (
                  <span className="text-green-400 text-sm font-medium flex items-center gap-1">
                    ✓ Connected
                    <span className="animate-pulse">⚡</span>
                  </span>
                ) : (
                  <span className="text-gray-400 text-sm">Waiting...</span>
                )}
              </div>
              
              {!fittrackeeConnected ? (
                <button
                  onClick={async () => {
                    const authStatus = await window.electron.fittrackeeCheckAuth()
                    if (!authStatus.authenticated) {
                      window.electron.openAuthModal()
                    } else {
                      setFittrackeeConnected(true)
                    }
                  }}
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
              onClick={handleSync}
              disabled={!usbConnected || !fittrackeeConnected || syncing}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all relative overflow-hidden ${
                !usbConnected || !fittrackeeConnected || syncing
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-500/25'
              }`}
            >
              {syncing ? (
                <>
                  <span className="animate-spin">⚡</span> Syncing... {stats?.unsynced - (localWorkouts.filter(w => !w.syncedAt).length - filteredWorkouts.length)} remaining
                </>
              ) : (
                '📥 Sync Unsynced Workouts'
              )}
            </button>
          </div>
        </section>

        {/* Activity Types Breakdown */}
        {stats && Object.keys(stats.byType).length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-purple-300 mb-4">📊 Activity Distribution</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byType).map(([type, count]) => (
                <span key={type} className="px-4 py-2 bg-white/10 rounded-full text-sm font-medium">
                  {getActivityIcon(type)} {getActivityLabel(type)}: {count}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Workouts List */}
        <section className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-purple-300">📋 Recent Workouts</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'all' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-black/20 text-gray-400 hover:text-white'
                }`}
              >
                All ({localWorkouts.length})
              </button>
              <button
                onClick={() => setActiveTab('unsynced')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'unsynced' 
                    ? 'bg-yellow-600 text-white' 
                    : 'bg-black/20 text-gray-400 hover:text-white'
                }`}
              >
                Unsynced ({stats?.unsynced || 0})
              </button>
            </div>
          </div>

          {filteredWorkouts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No workouts found. Connect your watch and sync!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {filteredWorkouts.map((workout) => (
                <div 
                  key={workout.id} 
                  className={`flex items-center justify-between p-4 rounded-lg transition-all ${
                    workout.syncedAt ? 'bg-black/20' : 'bg-yellow-500/10 border border-yellow-500/30'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{getActivityIcon(workout.type)}</span>
                    <div>
                      <h3 className="font-medium text-white">{getActivityLabel(workout.type)}</h3>
                      <p className="text-sm text-gray-400">{formatDate(workout.startTime)}</p>
                      {workout.deviceName && (
                        <p className="text-xs text-gray-500">📱 {workout.deviceName}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm text-purple-300">{formatDuration(workout.duration)}</p>
                      {workout.distance && (
                        <p className="text-xs text-gray-500">{(workout.distance / 1000).toFixed(2)} km</p>
                      )}
                    </div>
                    
                    {!workout.syncedAt ? (
                      <span className="px-3 py-1 bg-yellow-600/20 text-yellow-400 rounded-full text-xs font-medium">
                        ⏳ Unsynced
                      </span>
                    ) : (
                      <span className="text-green-400 text-sm">✓ Synced</span>
                    )}
                  </div>
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
