import { useState, useEffect } from 'react'

type ThemeMode = 'auto' | 'dark' | 'light'

interface ThemeToggleProps {
  onThemeChange: (mode: ThemeMode) => void
}

export function ThemeToggle({ onThemeChange }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeMode>('auto')
  const [systemPrefersDark, setSystemPrefersDark] = useState(false)

  useEffect(() => {
    // Check system preference on mount
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemPrefersDark(mediaQuery.matches)

    // Listen for system theme changes (only relevant when in auto mode)
    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'auto') {
        setSystemPrefersDark(e.matches)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const toggleTheme = () => {
    let nextMode: ThemeMode
    
    // Cycle through: auto -> dark -> light -> auto
    switch (theme) {
      case 'auto':
        nextMode = 'dark'
        break
      case 'dark':
        nextMode = 'light'
        break
      case 'light':
        nextMode = 'auto'
        break
    }

    setTheme(nextMode)
    onThemeChange(nextMode)
  }

  const getIcon = () => {
    switch (theme) {
      case 'auto': return '🌗'
      case 'dark': return '🌙'
      case 'light': return '☀️'
    }
  }

  const getLabel = () => {
    switch (theme) {
      case 'auto': return 'Auto'
      case 'dark': return 'Dark'
      case 'light': return 'Light'
    }
  }

  const getTooltip = () => {
    switch (theme) {
      case 'auto': 
        return systemPrefersDark 
          ? 'System Dark (Auto)' 
          : 'System Light (Auto)'
      case 'dark': return 'Forced Dark Mode'
      case 'light': return 'Forced Light Mode'
    }
  }

  const getButtonClass = () => {
    switch (theme) {
      case 'auto': return 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/30'
      case 'dark': return 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/30'
      case 'light': return 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white shadow-lg shadow-orange-400/30'
    }
  }

  return (
    <button
      onClick={toggleTheme}
      className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${getButtonClass()}`}
      title={getTooltip()}
      aria-label={`Current theme: ${theme}. Click to change. Tooltip: ${getTooltip()}`}
    >
      <span className="text-lg">{getIcon()}</span>
      <span className="text-sm hidden sm:inline">{getLabel()}</span>
    </button>
  )
}
