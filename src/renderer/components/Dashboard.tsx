import { useState, useEffect } from 'react'
import { ipcRenderer } from 'electron'
import { WorkoutDetails } from './WorkoutDetails'
import { ThemeToggle } from './ThemeToggle'

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
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, percentage: 0 })
  const [selectedWorkout, setSelectedWorkout] = useState<LocalWorkout | null>(null)
  const [themeMode, setThemeMode] = useState<'auto' | 'dark' | 'light'>('auto')

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
    
    // Get unsynced workouts count for progress tracking
    const unsyncedWorkouts = localWorkouts.filter(w => !w.syncedAt)
    setSyncProgress({ current: 0, total: unsyncedWorkouts.length, percentage: 0 })
    setSyncing(true)
    
    // Listen to sync progress events
    const progressHandler = (_event: any, progress: { current: number; total: number }) => {
      setSyncProgress({
        current: progress.current,
        total: progress.total,
        percentage: progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
      })
    }
    
    ipcRenderer.on('sync-progress', progressHandler)
    
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
      ipcRenderer.removeAllListeners('sync-progress')
      // Reset progress after a short delay
      setTimeout(() => {
        setSyncProgress({ current: 0, total: 0, percentage: 0 })
      }, 3000)
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

  const systemPrefersDark = () => {
    if (themeMode === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return themeMode === 'dark'
  }

  const isLightTheme = themeMode === 'light' || (!systemPrefersDark() && themeMode !== 'dark')

  return (
    <div className={`min-h-screen transition-all duration-500 ${
      isLightTheme ? 'bg-gray-100 text-gray-900' : 'bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-40 transition-all duration-500 ${
        isLightTheme ? 'bg-gray-100 border-b border-gray-200' : 'bg-black/30 backdrop-blur-lg border-b border-white/10'
      }`}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className={`text-2xl font-bold transition-all duration-500 ${
            isLightTheme ? 'bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent' : 
            'bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent'
          }`}>⚡ WorkoutPulse</h1>
          
          <div className="flex items-center gap-3">
            <ThemeToggle onThemeChange={setThemeMode} />
            
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
            
            <span className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              fittrackeeConnected 
                ? 'bg-blue-500/20 text-blue-400' 
                : isLightTheme ? 'bg-gray-200 text-gray-600' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {fittrackeeConnected ? '🎯 Fittrackee Connected' : '🔐 Not Logged In'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        {stats && (
          <section className={`grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 transition-all duration-500 ${
            isLightTheme ? '' : 'backdrop-blur-lg'
          }`}>
            <div className={`rounded-xl p-4 border transition-all duration-500 ${
              isLightTheme 
                ? 'bg-white text-gray-900 border-gray-200 shadow-md' 
                : 'bg-white/5 backdrop-blur-lg rounded-xl p-4 border border-white/10'
            }`}>
              <p className={`text-sm mb-1 transition-colors duration-500 ${
                isLightTheme ? 'text-gray-600' : 'text-gray-400'
              }`}>Total Workouts</p>
              <p className={`text-3xl font-bold transition-colors duration-500 ${
                isLightTheme ? 'text-gray-900' : 'text-white'
              }`}>{stats.total}</p>
            </div>
            
            <div className={`rounded-xl p-4 border transition-all duration-500 ${
              isLightTheme 
                ? 'bg-white text-gray-900 border-gray-200 shadow-md' 
                : 'bg-white/5 backdrop-blur-lg rounded-xl p-4 border border-white/10'
            }`}>
              <p className={`text-sm mb-1 transition-colors duration-500 ${
                isLightTheme ? 'text-gray-600' : 'text-gray-400'
              }`}>Synced</p>
              <p className={`text-3xl font-bold transition-colors duration-500 ${
                isLightTheme ? 'text-green-600' : 'text-green-400'
              }`}>{stats.synced}</p>
            </div>
            
            <div className={`rounded-xl p-4 border transition-all duration-500 ${
              isLightTheme 
                ? 'bg-white text-gray-900 border-gray-200 shadow-md' 
                : 'bg-white/5 backdrop-blur-lg rounded-xl p-4 border border-white/10'
            }`}>
              <p className={`text-sm mb-1 transition-colors duration-500 ${
                isLightTheme ? 'text-gray-600' : 'text-gray-400'
              }`}>Unsynced</p>
              <p className={`text-3xl font-bold transition-colors duration-500 ${
                isLightTheme ? 'text-yellow-600' : 'text-yellow-400'
              }`}>{stats.unsynced}</p>
            </div>
            
            <div className={`rounded-xl p-4 border transition-all duration-500 ${
              isLightTheme 
                ? 'bg-white text-gray-900 border-gray-200 shadow-md' 
                : 'bg-white/5 backdrop-blur-lg rounded-xl p-4 border border-white/10'
            }`}>
              <p className={`text-sm mb-1 transition-colors duration-500 ${
                isLightTheme ? 'text-gray-600' : 'text-gray-400'
              }`}>Activity Types</p>
              <p className={`text-2xl font-bold transition-colors duration-500 ${
                isLightTheme ? 'text-purple-600' : 'text-purple-400'
              }`}>{Object.keys(stats.byType).length}</p>
            </div>
          </section>
        )}

        {/* Connection & Actions */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className={`rounded-xl p-6 border transition-all duration-500 ${
            isLightTheme 
              ? 'bg-white text-gray-900 border-gray-200 shadow-md' 
              : 'bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10'
          }`}>
            <h2 className={`text-lg font-semibold mb-4 transition-colors duration-500 ${
              isLightTheme ? 'text-purple-700' : 'text-purple-300'
            }`}>📡 Connection Status</h2>
            
            <div className="space-y-3">
              <div className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                isLightTheme ? 'bg-gray-100 text-gray-900' : 'bg-black/20'
              }`}>
                <div className="flex items-center gap-2">
                  <span>Smartwatch USB</span>
                  {usbConnecting && (
                    <span className="animate-spin text-yellow-400">🔄</span>
                  )}
                </div>
                {usbConnecting ? (
                  <span className={`text-sm font-medium animate-pulse ${isLightTheme ? 'text-yellow-600' : 'text-yellow-400'}`}>Detecting...</span>
                ) : usbConnected ? (
                  <span className="text-green-400 text-sm font-medium flex items-center gap-1">
                    ✓ Connected
                    <span className="animate-pulse">⚡</span>
                  </span>
                ) : (
                  <span className={`text-sm ${isLightTheme ? 'text-gray-600' : 'text-gray-400'}`}>Waiting...</span>
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
                <div className={`p-3 rounded-lg border transition-colors ${
                  isLightTheme ? 'bg-green-100 border-green-200 text-green-800' : 'bg-green-500/20 border-green-500/30 text-green-400'
                }`}>
                  <span className="text-sm font-medium">✓ Fittrackee Connected</span>
                </div>
              )}
            </div>
          </div>

          <div className={`rounded-xl p-6 border transition-all duration-500 ${
            isLightTheme 
              ? 'bg-white text-gray-900 border-gray-200 shadow-md' 
              : 'bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10'
          }`}>
            <h2 className={`text-lg font-semibold mb-4 transition-colors duration-500 ${
              isLightTheme ? 'text-purple-700' : 'text-purple-300'
            }`}>🔄 Quick Actions</h2>
            
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
                  <span className="animate-spin">⚡</span> Syncing...
                </>
              ) : (
                '📥 Sync Unsynced Workouts'
              )}
            </button>
            
            {/* Progress Bar */}
            {syncing && syncProgress.total > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className={isLightTheme ? 'text-gray-600' : 'text-gray-300'}>{syncProgress.current} / {syncProgress.total}</span>
                  <span className="text-purple-300 font-medium">{syncProgress.percentage}%</span>
                </div>
                <div className={`w-full rounded-full h-3 overflow-hidden transition-colors ${
                  isLightTheme ? 'bg-gray-200' : 'bg-black/20'
                }`}>
                  <div 
                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-300 ease-out rounded-full flex items-center justify-end pr-1"
                    style={{ width: `${syncProgress.percentage}%` }}
                  >
                    {syncProgress.percentage >= 10 && (
                      <span className="text-xs text-white font-medium drop-shadow-lg">
                        {syncProgress.current} synced
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Activity Types Breakdown */}
        {stats && Object.keys(stats.byType).length > 0 && (
          <section className="mb-8">
            <h2 className={`text-lg font-semibold mb-4 transition-colors duration-500 ${
              isLightTheme ? 'text-purple-700' : 'text-purple-300'
            }`}>📊 Activity Distribution</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byType).map(([type, count]) => (
                <span key={type} className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isLightTheme ? 'bg-purple-100 text-purple-800' : 'bg-white/10 text-gray-300'
                }`}>
                  {getActivityIcon(type)} {getActivityLabel(type)}: {count}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Workouts List */}
        <section className={`rounded-xl p-6 border transition-all duration-500 ${
          isLightTheme 
            ? 'bg-white text-gray-900 border-gray-200 shadow-md' 
            : 'bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-semibold transition-colors duration-500 ${
              isLightTheme ? 'text-purple-700' : 'text-purple-300'
            }`}>📋 Recent Workouts</h2>
            
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'all' 
                    ? 'bg-purple-600 text-white' 
                    : isLightTheme ? 'bg-gray-100 text-gray-600 hover:text-gray-900' : 'bg-black/20 text-gray-400 hover:text-white'
                }`}
              >
                All ({localWorkouts.length})
              </button>
              
              <button
                onClick={() => setActiveTab('unsynced')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'unsynced' 
                    ? 'bg-yellow-600 text-white' 
                    : isLightTheme ? 'bg-gray-100 text-gray-600 hover:text-gray-900' : 'bg-black/20 text-gray-400 hover:text-white'
                }`}
              >
                Unsynced ({stats?.unsynced || 0})
              </button>
            </div>
          </div>

          {filteredWorkouts.length === 0 ? (
            <div className={`text-center py-8 transition-colors ${
              isLightTheme ? 'text-gray-600' : 'text-gray-400'
            }`}>
              <p>No workouts found. Connect your watch and sync!</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {filteredWorkouts.map((workout) => (
                <div 
                  key={workout.id} 
                  onClick={() => setSelectedWorkout(workout)}
                  className={`flex items-center justify-between p-4 rounded-lg transition-all cursor-pointer hover:scale-[1.02] ${
                    workout.syncedAt ? (isLightTheme ? 'bg-gray-50' : 'bg-black/20') : 'bg-yellow-500/10 border border-yellow-500/30'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{getActivityIcon(workout.type)}</span>
                    <div>
                      <h3 className={`font-medium transition-colors ${isLightTheme ? 'text-gray-900' : 'text-white'}`}>{getActivityLabel(workout.type)}</h3>
                      <p className="text-sm text-gray-400">{formatDate(workout.startTime)}</p>
                      {workout.deviceName && (
                        <p className="text-xs text-gray-500">📱 {workout.deviceName}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className={`text-sm transition-colors ${isLightTheme ? 'text-purple-700' : 'text-purple-300'}`}>{formatDuration(workout.duration)}</p>
                      {workout.distance && (
                        <p className="text-xs text-gray-500">{(workout.distance / 1000).toFixed(2)} km</p>
                      )}
                    </div>
                    
                    {!workout.syncedAt ? (
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${isLightTheme ? 'bg-yellow-100 text-yellow-800' : 'bg-yellow-600/20 text-yellow-400'}`}>
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

        {/* Workout Details Modal */}
        {selectedWorkout && (
          <WorkoutDetails
            workout={selectedWorkout}
            onClose={() => setSelectedWorkout(null)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className={`text-center py-6 text-sm transition-colors ${
        isLightTheme ? 'text-gray-600' : 'text-gray-500'
      }`}>
        WorkoutPulse • Sync your fitness journey 🚀
      </footer>
    </div>
  )
}
