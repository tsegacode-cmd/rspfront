let audioContext

export const getAppSoundsEnabled = () => {
  try {
    return localStorage.getItem('redseaAppSounds') !== 'false'
  } catch {
    return true
  }
}

export const setAppSoundsEnabled = enabled => {
  try {
    localStorage.setItem('redseaAppSounds', String(Boolean(enabled)))
    window.dispatchEvent(new Event('redsea:sound-settings-updated'))
  } catch (error) {
    console.error('Could not save sound preference:', error)
  }
}

export const unlockAppSounds = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  try {
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass()
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(error => console.warn('Could not enable notification sounds:', error))
    }
  } catch (error) {
    console.warn('Could not enable notification sounds:', error)
  }
}

export const playAppSound = (kind = 'message') => {
  if (!getAppSoundsEnabled() || !audioContext || audioContext.state !== 'running') return

  try {
    const startTime = audioContext.currentTime
    const frequencies = kind === 'notification' ? [760] : [520, 660]
    frequencies.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      const toneStart = startTime + index * .12
      const toneEnd = toneStart + .14
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, toneStart)
      gain.gain.setValueAtTime(.001, toneStart)
      gain.gain.exponentialRampToValueAtTime(.08, toneStart + .02)
      gain.gain.exponentialRampToValueAtTime(.001, toneEnd)
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      oscillator.start(toneStart)
      oscillator.stop(toneEnd)
    })
  } catch (error) {
    console.warn('Could not play an application notification sound:', error)
  }
}
