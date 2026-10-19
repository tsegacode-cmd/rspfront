export const getSocialShareLinks = (title, text, url) => {
  const message = [text || title, url].filter(Boolean).join('\n')
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text || title)}`
  }
}
