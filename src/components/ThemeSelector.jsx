import { usePreferencesContext } from '../contexts/PreferencesContext.jsx'
import { THEME_OPTIONS } from '../services/preferencesStorage.js'
import './ThemeSelector.css'

function ThemeSelector() {
  const { theme, setTheme } = usePreferencesContext()

  return (
    <label className="theme-selector">
      <span aria-hidden="true">🎨</span>
      <span className="theme-selector-label">Theme</span>
      <select
        aria-label="Choose appearance theme"
        value={theme}
        onChange={event => setTheme(event.target.value)}
      >
        {THEME_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

export default ThemeSelector
