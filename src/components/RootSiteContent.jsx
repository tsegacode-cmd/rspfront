import { useEffect, useState } from 'react'
import { rootAPI, siteContentAPI } from '../services/api'
import { DEFAULT_SITE_CONTENT, SITE_CONTENT_STORAGE_KEY } from '../contexts/SiteContentContext'
import { DEFAULT_ROLE_HIDDEN_MENUS, SITE_ACCOUNT_ROLES, SITE_HEADER_MENUS } from '../utils/siteMenuVisibility'
import './RootSiteContent.css'

const normalizeAccountAccessSettings = (settings = {}) => {
  const rules = Array.isArray(settings.rules) ? settings.rules : []
  const normalizedRules = rules.map((rule, index) => ({
    role: String(rule?.role || `role_${index + 1}`).trim().toLowerCase(),
    label: String(rule?.label || rule?.role || `Role ${index + 1}`).trim(),
    enabled: rule?.enabled !== false,
    hiddenMenus: Array.isArray(rule?.hiddenMenus)
      ? rule.hiddenMenus.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean)
      : [],
    hiddenRoutes: Array.isArray(rule?.hiddenRoutes)
      ? rule.hiddenRoutes.filter(value => typeof value === 'string').map(value => value.trim().replace(/^\/+/, '').replace(/\/+$/, '')).filter(Boolean)
      : [],
    notes: typeof rule?.notes === 'string' ? rule.notes.slice(0, 500) : '',
  }))
  const existingRoles = new Set(normalizedRules.map(rule => rule.role))

  return {
    enabled: settings.enabled !== false,
    rules: [
      ...normalizedRules,
      ...SITE_ACCOUNT_ROLES
        .filter(({ key }) => !existingRoles.has(key))
        .map(({ key, label }) => ({
          role: key,
          label,
          enabled: true,
          hiddenMenus: DEFAULT_ROLE_HIDDEN_MENUS[key] || [],
          hiddenRoutes: [],
          notes: '',
        })),
    ],
  }
}

const normalizeMenuKey = value => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === '/' ? '/' : normalized.replace(/^\/+|\/+$/g, '')
}

const isMenuVisibleForRule = (rule, menu) => {
  const menuKey = normalizeMenuKey(menu.id)
  const routeKey = normalizeMenuKey(menu.route)
  return ![
    ...(Array.isArray(rule?.hiddenMenus) ? rule.hiddenMenus : []),
    ...(Array.isArray(rule?.hiddenRoutes) ? rule.hiddenRoutes : []),
  ].some(value => {
    const hiddenKey = normalizeMenuKey(value)
    return hiddenKey === menuKey || hiddenKey === routeKey
  })
}

function RootSiteContent() {
  const [content, setContent] = useState(() => ({
    ...DEFAULT_SITE_CONTENT,
    accountAccessSettings: normalizeAccountAccessSettings(DEFAULT_SITE_CONTENT.accountAccessSettings),
  }))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    siteContentAPI.get()
      .then(response => {
        if (active) {
          setContent({
            ...DEFAULT_SITE_CONTENT,
            ...response.data,
            accountAccessSettings: normalizeAccountAccessSettings(response.data?.accountAccessSettings || DEFAULT_SITE_CONTENT.accountAccessSettings),
          })
        }
      })
      .catch(loadError => {
        console.error('Could not load website content settings:', loadError)
        if (active) setError(loadError.message || 'Could not load website content.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  const updateField = (field, value) => {
    setContent(current => ({ ...current, [field]: value }))
    setSaved(false)
  }

  const updateAccountAccess = (value) => {
    setContent(current => ({
      ...current,
      accountAccessSettings: normalizeAccountAccessSettings(value),
    }))
    setSaved(false)
  }

  const updateRoleEnabled = (role, enabled) => {
    setContent(current => {
      const settings = normalizeAccountAccessSettings(current.accountAccessSettings)
      return {
        ...current,
        accountAccessSettings: {
          ...settings,
          rules: settings.rules.map(rule => rule.role === role ? { ...rule, enabled } : rule),
        },
      }
    })
    setSaved(false)
  }

  const updateRoleMenuVisibility = (role, menu, visible) => {
    setContent(current => {
      const settings = normalizeAccountAccessSettings(current.accountAccessSettings)
      const rules = settings.rules.map(rule => {
        if (rule.role !== role) return rule
        const hiddenValues = new Set(rule.hiddenMenus)
        const menuKey = normalizeMenuKey(menu.id)
        const routeKey = normalizeMenuKey(menu.route)
        const hiddenRoutes = rule.hiddenRoutes.filter(value => {
          const key = normalizeMenuKey(value)
          return visible || (key !== menuKey && key !== routeKey)
        })
        if (visible) {
          for (const value of hiddenValues) {
            const key = normalizeMenuKey(value)
            if (key === menuKey || key === routeKey) hiddenValues.delete(value)
          }
        } else {
          hiddenValues.add(menu.id)
        }
        return { ...rule, hiddenMenus: [...hiddenValues], hiddenRoutes }
      })
      return {
        ...current,
        accountAccessSettings: {
          ...settings,
          rules,
        },
      }
    })
    setSaved(false)
  }

  const saveContent = async event => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const updatedContent = {
      ...content,
      services: (content.services || [])
        .map(service => service.trim())
        .filter(Boolean),
      contactServiceOptions: (content.contactServiceOptions || [])
        .map(service => service.trim())
        .filter(Boolean),
      accountAccessSettings: normalizeAccountAccessSettings(content.accountAccessSettings),
    }

    try {
      const response = await rootAPI.saveSiteContent(updatedContent)
      setContent({
        ...DEFAULT_SITE_CONTENT,
        ...response.data,
        accountAccessSettings: normalizeAccountAccessSettings(response.data?.accountAccessSettings || DEFAULT_SITE_CONTENT.accountAccessSettings),
      })
      try {
        window.localStorage.setItem(SITE_CONTENT_STORAGE_KEY, JSON.stringify(response.data))
      } catch (storageError) {
        console.error('Could not broadcast website content changes to other tabs:', storageError)
      }
      window.dispatchEvent(new CustomEvent('redsea:site-content-updated', { detail: response.data }))
      setSaved(true)
    } catch (saveError) {
      console.error('Could not save website content:', saveError)
      setError(saveError.message || 'Could not save website content.')
    } finally {
      setSaving(false)
    }
  }

  const roleRules = content.accountAccessSettings?.rules || []

  if (loading) {
    return <div className="site-content-state" role="status">Loading website content…</div>
  }

  return (
    <section className="site-content-editor">
      <h2 className="section-title">Website Content &amp; Visibility</h2>
      <p className="section-description">
        Edit shared website content, customize the Contact page, and control page visibility by account role.
      </p>
      {error && <p className="site-content-message error" role="alert">{error}</p>}
      {saved && <p className="site-content-message success" role="status">Website content saved.</p>}

      <form onSubmit={saveContent}>
        <div className="site-content-fields">
          <fieldset className="site-content-group">
            <legend>Header</legend>
            <label>
              Brand name
              <input
                value={content.headerTitle}
                maxLength={100}
                required
                onChange={event => updateField('headerTitle', event.target.value)}
              />
            </label>
            <label>
              Tagline
              <textarea
                value={content.headerTagline}
                maxLength={500}
                rows={3}
                required
                onChange={event => updateField('headerTagline', event.target.value)}
              />
            </label>
          </fieldset>

          <fieldset className="site-content-group">
            <legend>Loading screen &amp; app install</legend>
            <label>
              Loading screen name
              <input
                value={content.loadingScreenTitle}
                maxLength={100}
                required
                onChange={event => updateField('loadingScreenTitle', event.target.value)}
              />
            </label>
            <label>
              Install app button text
              <input
                value={content.installAppButtonText}
                maxLength={100}
                required
                onChange={event => updateField('installAppButtonText', event.target.value)}
              />
            </label>
          </fieldset>

          <fieldset className="site-content-group">
            <legend>Footer</legend>
            <label>
              Brand name
              <input
                value={content.footerBrandTitle}
                maxLength={100}
                required
                onChange={event => updateField('footerBrandTitle', event.target.value)}
              />
            </label>
            <label>
              Brand description
              <textarea
                value={content.footerDescription}
                maxLength={500}
                rows={3}
                required
                onChange={event => updateField('footerDescription', event.target.value)}
              />
            </label>
            <label>
              Services heading
              <input
                value={content.servicesTitle}
                maxLength={100}
                required
                onChange={event => updateField('servicesTitle', event.target.value)}
              />
            </label>
            <label>
              Services (one per line)
              <textarea
                value={content.services.join('\n')}
                maxLength={2000}
                rows={4}
                onChange={event => updateField('services', event.target.value.split('\n'))}
              />
            </label>
            <label>
              Contact heading
              <input
                value={content.contactTitle}
                maxLength={100}
                required
                onChange={event => updateField('contactTitle', event.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={content.email}
                maxLength={254}
                required
                onChange={event => updateField('email', event.target.value)}
              />
            </label>
            <label>
              Phone
              <input
                value={content.phone}
                maxLength={80}
                onChange={event => updateField('phone', event.target.value)}
              />
            </label>
            <label>
              Copyright text
              <textarea
                value={content.copyrightText}
                maxLength={500}
                rows={2}
                required
                onChange={event => updateField('copyrightText', event.target.value)}
              />
            </label>
            <label>
              Terms &amp; Conditions / reward policy
              <textarea
                value={content.termsAndConditions || DEFAULT_SITE_CONTENT.termsAndConditions}
                maxLength={20000}
                rows={12}
                required
                onChange={event => updateField('termsAndConditions', event.target.value)}
              />
              <small>This text is shown in the public footer popup. Plain text and line breaks are supported.</small>
            </label>
          </fieldset>

          <fieldset className="site-content-group">
            <legend>Contact page</legend>
            <label>Page title
              <input value={content.contactPageTitle} maxLength={120} required onChange={event => updateField('contactPageTitle', event.target.value)} />
            </label>
            <label>Page subtitle
              <textarea value={content.contactPageSubtitle} maxLength={500} rows={2} required onChange={event => updateField('contactPageSubtitle', event.target.value)} />
            </label>
            <label>Introduction heading
              <input value={content.contactIntroTitle} maxLength={120} required onChange={event => updateField('contactIntroTitle', event.target.value)} />
            </label>
            <label>Introduction text
              <textarea value={content.contactIntroText} maxLength={2000} rows={4} required onChange={event => updateField('contactIntroText', event.target.value)} />
            </label>
            <label>Office section heading
              <input value={content.contactOfficeTitle} maxLength={120} required onChange={event => updateField('contactOfficeTitle', event.target.value)} />
            </label>
            <label>Office location details
              <textarea value={content.contactOfficeDetails} maxLength={1000} rows={3} required onChange={event => updateField('contactOfficeDetails', event.target.value)} />
            </label>
            <label>Phone section heading
              <input value={content.contactPhoneTitle} maxLength={120} required onChange={event => updateField('contactPhoneTitle', event.target.value)} />
            </label>
            <label>Phone details
              <textarea value={content.contactPhoneDetails} maxLength={1000} rows={3} required onChange={event => updateField('contactPhoneDetails', event.target.value)} />
            </label>
            <label>Email section heading
              <input value={content.contactEmailTitle} maxLength={120} required onChange={event => updateField('contactEmailTitle', event.target.value)} />
            </label>
            <label>Email details
              <textarea value={content.contactEmailDetails} maxLength={1000} rows={3} required onChange={event => updateField('contactEmailDetails', event.target.value)} />
            </label>
            <label>Business hours heading
              <input value={content.contactHoursTitle} maxLength={120} required onChange={event => updateField('contactHoursTitle', event.target.value)} />
            </label>
            <label>Business hours details
              <textarea value={content.contactHoursDetails} maxLength={1000} rows={3} required onChange={event => updateField('contactHoursDetails', event.target.value)} />
            </label>
            <label>Message form heading
              <input value={content.contactFormTitle} maxLength={120} required onChange={event => updateField('contactFormTitle', event.target.value)} />
            </label>
            <label>Service options (one per line)
              <textarea
                value={(content.contactServiceOptions || DEFAULT_SITE_CONTENT.contactServiceOptions).join('\n')}
                maxLength={2000}
                rows={4}
                onChange={event => updateField('contactServiceOptions', event.target.value.split('\n'))}
              />
            </label>
            <label>Send button text
              <input value={content.contactSendButtonText} maxLength={80} required onChange={event => updateField('contactSendButtonText', event.target.value)} />
            </label>
            <label>About section heading
              <input value={content.contactAboutTitle} maxLength={120} required onChange={event => updateField('contactAboutTitle', event.target.value)} />
            </label>
            <label>About section paragraph 1
              <textarea value={content.contactAboutParagraphOne} maxLength={3000} rows={4} required onChange={event => updateField('contactAboutParagraphOne', event.target.value)} />
            </label>
            <label>About section paragraph 2
              <textarea value={content.contactAboutParagraphTwo} maxLength={3000} rows={4} required onChange={event => updateField('contactAboutParagraphTwo', event.target.value)} />
            </label>
            <small>Submitted contact messages are delivered to Root through the website Live Chat inbox.</small>
          </fieldset>

          <fieldset className="site-content-group">
            <legend>Account access, page &amp; menu visibility</legend>
            <label className="role-access-toggle">
              <input
                type="checkbox"
                checked={content.accountAccessSettings?.enabled !== false}
                onChange={event => updateAccountAccess({
                  ...(content.accountAccessSettings || {}),
                  enabled: event.target.checked,
                })}
              />
              Enable role-based menu visibility
            </label>
            <p className="section-description">
              Choose which website pages and menus are available for each account role. Hiding a page also blocks direct access and hides its matching navigation entry. Individual-user overrides are not configured. Root Admin access is not affected.
            </p>
            <div className="site-menu-visibility-table-wrap">
              <table className="site-menu-visibility-table">
                <thead>
                  <tr>
                    <th scope="col">Website page or menu</th>
                    {SITE_ACCOUNT_ROLES.map(role => {
                      const rule = roleRules.find(item => item.role === role.key)
                      return (
                        <th key={role.key} scope="col">
                          <label className="site-role-visibility-toggle">
                            <input
                              type="checkbox"
                              checked={rule?.enabled !== false}
                              disabled={content.accountAccessSettings?.enabled === false}
                              aria-label={`Enable menu visibility settings for ${role.label}`}
                              onChange={event => updateRoleEnabled(role.key, event.target.checked)}
                            />
                            {role.label}
                          </label>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {SITE_HEADER_MENUS.map(menu => (
                    <tr key={menu.id}>
                      <th scope="row">{menu.label}</th>
                      {SITE_ACCOUNT_ROLES.map(role => {
                        const rule = roleRules.find(item => item.role === role.key)
                        const visible = isMenuVisibleForRule(rule, menu)
                        return (
                          <td key={role.key}>
                            <label className="site-menu-visibility-switch">
                              <input
                                type="checkbox"
                                checked={visible}
                                disabled={content.accountAccessSettings?.enabled === false || rule?.enabled === false}
                                aria-label={`${visible ? 'Show' : 'Hide'} ${menu.label} menu for ${role.label}`}
                                onChange={event => updateRoleMenuVisibility(role.key, menu, event.target.checked)}
                              />
                              <span>{visible ? 'Shown' : 'Hidden'}</span>
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </fieldset>
        </div>

        <button className="site-content-save" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save website content'}
        </button>
      </form>
    </section>
  )
}

export default RootSiteContent
