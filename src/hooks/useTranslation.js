import { useLanguage } from '../contexts/LanguageContext'
import en from '../locales/en.json'
import am from '../locales/am.json'

export const useTranslation = () => {
  const { language } = useLanguage()
  
  const translations = {
    en,
    am
  }
  
  const t = (key) => {
    const keys = key.split('.')
    let value = translations[language]
    
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k]
      } else {
        return key // Return key if translation not found
      }
    }
    
    return value || key
  }
  
  return { t, language }
}
