export const playRewardCelebrationSound = () => {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextConstructor) return

  let audioContext
  try {
    audioContext = new AudioContextConstructor()
    const playNotes = () => {
      const notes = [659.25, 783.99, 987.77, 1318.51]
      notes.forEach((frequency, index) => {
        const start = audioContext.currentTime + index * 0.11
        const oscillator = audioContext.createOscillator()
        const volume = audioContext.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, start)
        volume.gain.setValueAtTime(0.0001, start)
        volume.gain.exponentialRampToValueAtTime(0.12, start + 0.02)
        volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
        oscillator.connect(volume)
        volume.connect(audioContext.destination)
        oscillator.start(start)
        oscillator.stop(start + 0.23)
        if (index === notes.length - 1) {
          oscillator.addEventListener('ended', () => {
            audioContext.close().catch(error => console.error('Could not close reward sound audio:', error))
          }, { once: true })
        }
      })
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().then(playNotes).catch(error => {
        console.error('Could not play reward celebration sound:', error)
        audioContext.close().catch(closeError => console.error('Could not close reward sound audio:', closeError))
      })
    } else {
      playNotes()
    }
  } catch (error) {
    console.error('Could not play reward celebration sound:', error)
    if (audioContext) audioContext.close().catch(closeError => console.error('Could not close reward sound audio:', closeError))
  }
}
