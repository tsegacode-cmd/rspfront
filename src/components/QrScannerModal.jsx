import { useEffect, useRef, useState } from 'react'
import './QrScannerModal.css'

function QrScannerModal({ onClose }) {
  const videoRef = useRef(null)
  const [scanResult, setScanResult] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let stream = null
    let timer = null

    const stopCamera = () => {
      if (timer) window.clearTimeout(timer)
      stream?.getTracks().forEach(track => track.stop())
      stream = null
    }

    const reportQr = text => {
      if (!text || !active) return
      setScanResult(text)
      setError('')
      window.dispatchEvent(new CustomEvent('redsea:qr-code-scanned', { detail: { text } }))
      stopCamera()
    }

    const startCamera = async () => {
      if (!('BarcodeDetector' in window)) {
        setError('QR scanning is not supported by this browser. Try a current version of Chrome or Edge.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access is not available. Open this site over HTTPS or localhost, or upload a QR image.')
        return
      }

      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } }
        })
        if (!active) {
          stopCamera()
          return
        }
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        const scanFrame = async () => {
          if (!active || !videoRef.current || videoRef.current.readyState < 2) {
            timer = window.setTimeout(scanFrame, 250)
            return
          }
          try {
            const detections = await detector.detect(videoRef.current)
            const qrText = detections.find(result => result.rawValue)?.rawValue
            if (qrText) {
              reportQr(qrText)
              return
            }
          } catch (scanError) {
            console.error('QR camera scan failed:', scanError)
            setError('The camera could not scan this QR code. Try repositioning it or upload a clear QR image.')
            stopCamera()
            return
          }
          timer = window.setTimeout(scanFrame, 250)
        }
        scanFrame()
      } catch (cameraError) {
        console.error('Could not start the QR scanner camera:', cameraError)
        setError(cameraError.message || 'Could not access the camera. Check browser camera permissions.')
      }
    }

    startCamera()
    return () => {
      active = false
      stopCamera()
    }
  }, [])

  const handleImageScan = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!('BarcodeDetector' in window)) {
      setError('QR image scanning is not supported by this browser. Try a current version of Chrome or Edge.')
      return
    }

    let bitmap
    try {
      bitmap = await createImageBitmap(file)
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const detections = await detector.detect(bitmap)
      const qrText = detections.find(result => result.rawValue)?.rawValue
      if (!qrText) {
        setError('No QR code was found in that image.')
        return
      }
      setScanResult(qrText)
      setError('')
      window.dispatchEvent(new CustomEvent('redsea:qr-code-scanned', { detail: { text: qrText } }))
    } catch (scanError) {
      console.error('Could not scan the uploaded QR image:', scanError)
      setError(scanError.message || 'Could not scan that image. Choose a clear QR code image.')
    } finally {
      bitmap?.close()
    }
  }

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(scanResult)
      setError('')
    } catch (clipboardError) {
      console.error('Could not copy the scanned QR text:', clipboardError)
      setError('Could not copy the text. Select it below and copy it manually.')
    }
  }

  return (
    <div className="qr-scanner-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="qr-scanner-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-scanner-title">
        <div className="qr-scanner-heading">
          <div>
            <h2 id="qr-scanner-title">QR Code Scanner</h2>
            <p>Scan QR codes only. Detected contents are treated as text.</p>
          </div>
          <button type="button" className="qr-scanner-close" onClick={onClose} aria-label="Close QR scanner">×</button>
        </div>

        <video ref={videoRef} className="qr-scanner-video" muted playsInline aria-label="Live QR camera preview" />
        <label className="qr-scanner-upload">
          Scan QR from an image
          <input type="file" accept="image/*" capture="environment" onChange={handleImageScan} />
        </label>

        {error && <p className="qr-scanner-error" role="alert">{error}</p>}
        {scanResult && (
          <div className="qr-scanner-result">
            <label htmlFor="qr-scanner-result-text">Scanned text (added to Transaction Number on the registration form)</label>
            <textarea id="qr-scanner-result-text" value={scanResult} readOnly rows={3} />
            <button type="button" onClick={handleCopyText}>Copy text</button>
          </div>
        )}
      </section>
    </div>
  )
}

export default QrScannerModal
