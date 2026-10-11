import { useCallback, useEffect, useRef, useState } from 'react'
import { voicePreviewUrl } from '../services/api'

/** Phát/dừng file nghe thử giọng đọc; mỗi lúc chỉ một giọng phát. */
export function useVoicePreview(onError?: (message: string) => void) {
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlaying(null)
  }, [])

  useEffect(() => stop, [stop])

  const toggle = useCallback(
    (voiceId: string) => {
      if (playing === voiceId) return stop()
      audioRef.current?.pause()
      const audio = new Audio(voicePreviewUrl(voiceId))
      audioRef.current = audio
      setPlaying(voiceId)
      const fail = () => {
        if (audioRef.current !== audio) return
        audioRef.current = null
        setPlaying(null)
        onError?.('Chưa nghe thử được giọng này (máy chủ chưa kết nối được dịch vụ lồng tiếng). Video vẫn tạo được bình thường.')
      }
      audio.onended = () => audioRef.current === audio && stop()
      audio.onerror = fail
      audio.play().catch((e) => {
        if (e?.name !== 'AbortError') fail()
      })
    },
    [playing, stop, onError],
  )

  return { playing, toggle, stop }
}
