import { useEffect, useState } from 'react'

export function useFullscreen(): { isFullscreen: boolean; toggleFullscreen: () => void } {
  const [isFullscreen, setIsFullscreen] = useState(
    typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  )

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {})
    }
  }

  return { isFullscreen, toggleFullscreen }
}
