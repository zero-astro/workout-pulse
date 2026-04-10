import { useState, useEffect } from 'react'

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

interface WorkoutDetailsProps {
  workout: LocalWorkout | null
  onClose: () => void
}

export function WorkoutDetails({ workout, onClose }: WorkoutDetailsProps) {
  const [isClosing, setIsClosing] = useState(false)

  useEffect(() => {
    if (workout) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [workout])

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 300)
  }

  if (!workout) return null

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}h ${mins}min`
    }
    return `${mins} min ${secs}s`
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('eu-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDistance = (meters?: number) => {
    if (!meters) return null
    return `${(meters / 1000).toFixed(2)} km`
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

  const getIntensityColor = (avgHr?: number, maxHr?: number) => {
    if (!avgHr || !maxHr) return 'text-gray-400'
    
    // Simple intensity calculation based on heart rate zones
    const estimatedMax = 220 - 30 // Assuming average age of 30
    const avgZone = (avgHr / estimatedMax) * 100
    
    if (avgZone < 60) return 'text-green-400'
    if (avgZone < 80) return 'text-yellow-400'
    return 'text-red-400'
  }

  const isSynced = !!workout.syncedAt

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      <div 
        className={`bg-gradient-to-br from-slate-800 to-purple-950 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-white/10 transform transition-all ${
          isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-r from-purple-600 to-pink-600">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-all"
          >
            ✕
          </button>
          
          <div className="flex items-start gap-4">
            <div className="text-5xl">{getActivityIcon(workout.type)}</div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-2">
                {getActivityLabel(workout.type)}
              </h2>
              <p className="text-purple-100 text-sm">
                {formatDate(workout.startTime)}
              </p>
            </div>
            
            {isSynced ? (
              <div className="px-4 py-2 bg-green-500/30 rounded-full border border-green-400/50">
                <span className="text-green-100 text-sm font-medium flex items-center gap-1">
                  ✓ Synced
                </span>
              </div>
            ) : (
              <div className="px-4 py-2 bg-yellow-500/30 rounded-full border border-yellow-400/50">
                <span className="text-yellow-100 text-sm font-medium flex items-center gap-1">
                  ⏳ Unsynced
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Main Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-gray-400 text-xs mb-1">Duration</p>
              <p className="text-xl font-bold text-purple-300">{formatDuration(workout.duration)}</p>
            </div>
            
            {workout.distance && (
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-gray-400 text-xs mb-1">Distance</p>
                <p className="text-xl font-bold text-green-300">{formatDistance(workout.distance)}</p>
              </div>
            )}
            
            {workout.calories && (
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-gray-400 text-xs mb-1">Calories</p>
                <p className="text-xl font-bold text-yellow-300">{Math.round(workout.calories)} kcal</p>
              </div>
            )}
            
            {workout.elevationGain && (
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-gray-400 text-xs mb-1">Elevation</p>
                <p className="text-xl font-bold text-blue-300">{workout.elevationGain} m</p>
              </div>
            )}
            
            {workout.avgHeartRate && (
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-gray-400 text-xs mb-1">Avg Heart Rate</p>
                <p className={`text-xl font-bold ${getIntensityColor(workout.avgHeartRate, workout.maxHeartRate)}`}>
                  {workout.avgHeartRate} bpm
                </p>
              </div>
            )}
            
            {workout.maxHeartRate && (
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-gray-400 text-xs mb-1">Max Heart Rate</p>
                <p className={`text-xl font-bold ${getIntensityColor(workout.avgHeartRate, workout.maxHeartRate)}`}>
                  {workout.maxHeartRate} bpm
                </p>
              </div>
            )}
          </div>

          {/* Device Info */}
          {workout.deviceName && (
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-gray-400 text-xs mb-2">Device</p>
              <div className="flex items-center gap-2">
                <span className="text-lg">📱</span>
                <span className="text-purple-300 font-medium">{workout.deviceName}</span>
              </div>
            </div>
          )}

          {/* Workout ID */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-gray-400 text-xs mb-2">Workout ID</p>
            <code className="text-purple-300 text-sm break-all">{workout.id}</code>
          </div>

          {/* Timeline */}
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-gray-400 text-xs mb-2">Timeline</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Start:</span>
                <span className="text-purple-300">{formatDate(workout.startTime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">End:</span>
                <span className="text-purple-300">{formatDate(workout.endTime)}</span>
              </div>
            </div>
          </div>

          {/* Synced At */}
          {isSynced && (
            <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/30">
              <p className="text-gray-400 text-xs mb-2">Synced to Fittrackee</p>
              <p className="text-green-300 text-sm">{formatDate(workout.syncedAt)}</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-white/10 bg-black/20">
          <button
            onClick={handleClose}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-all"
          >
            Close Details
          </button>
        </div>

        {/* CSS Animation */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  )
}
