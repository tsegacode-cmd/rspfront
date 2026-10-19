import { useEffect, useState } from 'react'
import { rootAPI } from '../services/api'
import './OtpDeliverySettings.css'

const initialSettings = {
  smsEndpoint: '',
  smsApiToken: '',
  smsProvider: 'custom',
  smsAuthHeader: 'Authorization',
  smsAuthPrefix: 'Bearer ',
  smsSenderId: '',
  smsAccountSid: '',
  smsMessagingServiceSid: '',
  smsBodyTemplate: '{"to":"{{phone}}","message":"{{message}}","sender":"{{sender}}"}',
  purposeMethods: {
    login: { sms: true, telegram: true, firebase_sms: true, email: true },
    password_reset: { sms: true, telegram: true, firebase_sms: true, email: true },
    upgrade: { sms: true, telegram: true, firebase_sms: true, email: true },
    registration: { sms: true, telegram: true, firebase_sms: true, email: true },
  },
  telegramWidgetMethods: { login: true, password_reset: true, registration: true, upgrade: true },
  telegramBotToken: '',
  telegramBotUsername: '',
  telegramWebhookUrl: '',
  telegramWebhookSecret: '',
  supportTelegramUsername: '',
  rootTelegramChatId: '',
  firebaseApiKey: '',
  firebaseAuthDomain: '',
  firebaseProjectId: '',
  firebaseAppId: '',
  resendApiKey: '',
  resendFromEmail: '',
}

function OtpDeliverySettings() {
  const [settings, setSettings] = useState(initialSettings)
  const [configured, setConfigured] = useState({
    smsConfigured: false,
    telegramConfigured: false,
    telegramLoginWidgetConfigured: false,
    telegramWebhookConfigured: false,
    rootTelegramChatConfigured: false,
    firebaseConfigured: false,
    resendConfigured: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [configuringTelegramWebhook, setConfiguringTelegramWebhook] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    rootAPI.getOtpSettings()
      .then(response => {
        if (!active) return
        setSettings(current => ({ ...current, ...response.data }))
        setConfigured(response.data)
      })
      .catch(loadError => {
        if (active) setError(loadError.message || 'Could not load OTP settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const update = event => {
    setSettings(current => ({ ...current, [event.target.name]: event.target.value }))
    setMessage('')
    setError('')
  }

  const togglePurposeMethod = (purpose, channel) => {
    setSettings(current => ({
      ...current,
      purposeMethods: {
        ...current.purposeMethods,
        [purpose]: {
          ...current.purposeMethods[purpose],
          [channel]: !current.purposeMethods[purpose][channel],
        },
      },
    }))
    setMessage('')
    setError('')
  }

  const toggleTelegramWidget = purpose => {
    setSettings(current => ({
      ...current,
      telegramWidgetMethods: {
        ...current.telegramWidgetMethods,
        [purpose]: !current.telegramWidgetMethods[purpose],
      },
    }))
    setMessage('')
    setError('')
  }

  const save = async event => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const response = await rootAPI.saveOtpSettings(settings)
      setConfigured(response.data)
      setSettings(current => ({ ...current, smsApiToken: '', telegramBotToken: '', telegramWebhookSecret: '', resendApiKey: '' }))
      setMessage(response.message || 'OTP delivery settings saved.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save OTP settings.')
    } finally {
      setSaving(false)
    }
  }

  const configureTelegramWebhook = async () => {
    setConfiguringTelegramWebhook(true)
    setMessage('')
    setError('')
    try {
      const saved = await rootAPI.saveOtpSettings(settings)
      setConfigured(saved.data)
      setSettings(current => ({ ...current, smsApiToken: '', telegramBotToken: '', telegramWebhookSecret: '', resendApiKey: '' }))
      const response = await rootAPI.configureTelegramContactWebhook()
      setConfigured(current => ({ ...current, telegramWebhookConfigured: true }))
      setMessage(response.message || 'Telegram phone-sharing webhook configured.')
    } catch (setupError) {
      setError(setupError.message || 'Could not configure Telegram phone sharing.')
    } finally {
      setConfiguringTelegramWebhook(false)
    }
  }

  const testTelegram = async () => {
    setTestingTelegram(true)
    setMessage('')
    setError('')
    try {
      const response = await rootAPI.testTelegramOtpSettings()
      setMessage(response.message || 'Telegram test message sent.')
    } catch (testError) {
      setError(testError.message || 'Could not test Telegram delivery.')
    } finally {
      setTestingTelegram(false)
    }
  }

  if (loading) return <section className="otp-settings"><p>Loading OTP settings...</p></section>

  return (
    <section className="otp-settings">
      <h2 className="section-title">OTP Delivery Settings</h2>
      <p className="section-description">
        Configure OTP delivery for phone/email account creation, sign-in, password resets, and guest upgrades. Telegram Mini App signup verifies Telegram identity directly and does not send an OTP; enable the Create account → Telegram provider and configure the bot's Main Mini App URL in BotFather.
        Provider tokens are encrypted in the database and never sent back to the browser.
      </p>
      {message && <p className="otp-settings-message success" role="status">{message}</p>}
      {error && <p className="otp-settings-message error" role="alert">{error}</p>}
      <form onSubmit={save}>
        <div className="otp-settings-grid">
          <fieldset>
            <legend>SMS provider</legend>
            <label>
              SMS gateway
              <select name="smsProvider" value={settings.smsProvider} onChange={update}>
                <option value="custom">Custom HTTPS SMS gateway</option>
                <option value="ethiopian_gateway">Ethio Telecom / Ethiopian gateway (custom API)</option>
                <option value="twilio">Twilio</option>
              </select>
            </label>
            {settings.smsProvider === 'twilio' ? (
              <>
                <p>Uses Twilio's Messages API. Enter credentials from your Twilio account; phone numbers must be in international format.</p>
                <label>
                  Twilio Account SID
                  <input name="smsAccountSid" value={settings.smsAccountSid} onChange={update} placeholder="AC..." autoComplete="off" />
                </label>
                <label>
                  Twilio Auth Token {configured.smsConfigured && <small>Configured; leave blank to keep the saved token.</small>}
                  <input name="smsApiToken" type="password" value={settings.smsApiToken} onChange={update} autoComplete="new-password" placeholder={configured.smsConfigured ? 'Saved securely' : 'Twilio Auth Token'} />
                </label>
                <div className="otp-settings-row">
                  <label>
                    Twilio sender number
                    <input name="smsSenderId" value={settings.smsSenderId} onChange={update} placeholder="+1..." />
                  </label>
                  <label>
                    Messaging Service SID (optional)
                    <input name="smsMessagingServiceSid" value={settings.smsMessagingServiceSid} onChange={update} placeholder="MG..." />
                  </label>
                </div>
                <small>Configure either a Twilio sender number or a Messaging Service SID.</small>
              </>
            ) : (
              <>
                <p>For Ethio Telecom and other Ethiopian SMS gateways, use the HTTPS endpoint, authentication, and JSON format provided by your gateway. REDSEA does not assume an undocumented provider API.</p>
                <label>
                  Provider HTTPS API endpoint
                  <input name="smsEndpoint" type="url" value={settings.smsEndpoint} onChange={update} placeholder="https://sms-provider.example/api/messages" />
                </label>
                <label>
                  API token {configured.smsConfigured && <small>Configured; leave blank to keep the saved token.</small>}
                  <input name="smsApiToken" type="password" value={settings.smsApiToken} onChange={update} autoComplete="new-password" placeholder={configured.smsConfigured ? 'Saved securely' : 'Provider API token'} />
                </label>
                <div className="otp-settings-row">
                  <label>
                    Authentication header
                    <input name="smsAuthHeader" value={settings.smsAuthHeader} onChange={update} placeholder="Authorization" />
                  </label>
                  <label>
                    Token prefix
                    <input name="smsAuthPrefix" value={settings.smsAuthPrefix} onChange={update} placeholder="Bearer " />
                  </label>
                </div>
                <label>
                  Sender ID
                  <input name="smsSenderId" value={settings.smsSenderId} onChange={update} placeholder="REDSEA" />
                </label>
                <label>
                  JSON request body template
                  <textarea name="smsBodyTemplate" rows="4" value={settings.smsBodyTemplate} onChange={update} />
                </label>
                <small>Use placeholders such as {'{{phone}}'}, {'{{message}}'}, {'{{otp}}'}, and {'{{sender}}'}.</small>
              </>
            )}
            <span className={`otp-provider-status ${configured.smsConfigured ? 'configured' : ''}`}>
              {configured.smsConfigured ? 'SMS provider configured' : 'SMS provider not configured'}
            </span>
          </fieldset>

          <fieldset>
            <legend>Telegram Bot API OTP</legend>
            <p>Configure the Telegram bot for signup. Telegram only shares a phone number after the user approves its native Share phone prompt. Set the bot's Main Mini App URL in BotFather and configure the webhook below to receive that approved contact. If using the Login Widget for other flows, authorize the public hostname with BotFather /setdomain.</p>
            <label>
              Telegram bot token {configured.telegramConfigured && <small>Configured; leave blank to keep the saved token.</small>}
              <input name="telegramBotToken" type="password" value={settings.telegramBotToken} onChange={update} autoComplete="new-password" placeholder={configured.telegramConfigured ? 'Saved securely' : '123456:bot-token'} />
            </label>
            <label>
              Telegram bot username
              <input name="telegramBotUsername" value={settings.telegramBotUsername} onChange={update} placeholder="YourRedSeaBot" />
            </label>
            <small>Use the username assigned to this bot by BotFather. Telegram bot usernames end in “bot”.</small>
            <label>
              Public HTTPS Telegram webhook URL
              <input name="telegramWebhookUrl" type="url" value={settings.telegramWebhookUrl} onChange={update} placeholder="https://example.com/api/v1/auth/telegram/webhook" />
            </label>
            <label>
              Telegram webhook secret {configured.telegramWebhookConfigured && <small>Configured; leave blank to keep the saved secret.</small>}
              <input name="telegramWebhookSecret" type="password" value={settings.telegramWebhookSecret} onChange={update} autoComplete="new-password" placeholder={configured.telegramWebhookConfigured ? 'Saved securely' : 'Use a random secret phrase'} />
            </label>
            <button
              className="otp-settings-save"
              type="button"
              onClick={configureTelegramWebhook}
              disabled={configuringTelegramWebhook || saving || !configured.telegramConfigured || !settings.telegramWebhookUrl}
            >
              {configuringTelegramWebhook ? 'Configuring Telegram phone sharing...' : 'Save settings, then configure phone sharing'}
            </button>
            <span className={`otp-provider-status ${configured.telegramWebhookConfigured ? 'configured' : ''}`}>
              {configured.telegramWebhookConfigured ? 'Telegram phone-sharing webhook configured' : 'Telegram phone-sharing webhook not configured'}
            </span>
            <small>Enter the full backend URL ending in /api/v1/auth/telegram/webhook. The button above saves these settings and registers the webhook with Telegram.</small>
            <span className={`otp-provider-status ${configured.telegramConfigured ? 'configured' : ''}`}>
              {configured.telegramConfigured ? 'Telegram bot configured' : 'Telegram bot not configured'}
            </span>
            <span className={`otp-provider-status ${configured.telegramLoginWidgetConfigured ? 'configured' : ''}`}>
              {configured.telegramLoginWidgetConfigured ? 'Telegram Login Widget configured' : 'Telegram Login Widget not configured'}
            </span>
          </fieldset>

          <fieldset>
            <legend>Telegram Login Widget buttons</legend>
            <p>Control whether the Telegram sign-in widget is shown on each supported form. Telegram delivery itself is also controlled by the provider switches below.</p>
            {[
              ['login', 'Sign-in form'],
              ['password_reset', 'Password-reset form'],
              ['registration', 'Create-account form'],
              ['upgrade', 'Guest-upgrade form'],
            ].map(([purpose, label]) => (
              <label className="otp-widget-switch" key={purpose}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={settings.telegramWidgetMethods?.[purpose] === true}
                  onChange={() => toggleTelegramWidget(purpose)}
                />
              </label>
            ))}
            <small>Password reset verifies the linked Telegram account with the widget, then sends a one-time code to that chat.</small>
          </fieldset>

          <fieldset>
            <legend>Send to Root OTP</legend>
            <p>Set the Telegram private chat ID for Root Portal OTP delivery. The recipient must start the configured bot first. This recipient setting is available here regardless of which OTP providers are configured.</p>
            <label>
              Root Telegram private chat ID
              <input name="rootTelegramChatId" inputMode="numeric" value={settings.rootTelegramChatId} onChange={update} placeholder="Numeric private chat ID" />
            </label>
            <span className={`otp-provider-status ${configured.rootTelegramChatConfigured ? 'configured' : ''}`}>
              {configured.rootTelegramChatConfigured ? 'Root Telegram chat configured' : 'Root Telegram chat not configured'}
            </span>
            <button
              className="otp-settings-save"
              type="button"
              onClick={testTelegram}
              disabled={testingTelegram || saving || !configured.telegramConfigured || !configured.rootTelegramChatConfigured}
            >
              {testingTelegram ? 'Sending test message...' : 'Test Telegram delivery'}
            </button>
            <small>Save the settings first, then test that the bot token, username, and private chat ID all work together.</small>
          </fieldset>

          <fieldset>
            <legend>Telegram support</legend>
            <p>Set the public Telegram username customers can use to contact support. Enter the username without the @ sign.</p>
            <label>
              Support Telegram username
              <input name="supportTelegramUsername" value={settings.supportTelegramUsername} onChange={update} placeholder="RedSeaSupport" autoComplete="off" />
            </label>
          </fieldset>

          <fieldset>
            <legend>Firebase Phone Authentication</legend>
            <p>Use the Firebase Web app configuration for phone OTP. Enable Phone as a sign-in provider in Firebase Authentication and add this site's domain to the authorized domains. Firebase applies its own reCAPTCHA, code expiry, and verification limits.</p>
            <label>
              Firebase Web API key
              <input name="firebaseApiKey" type="password" value={settings.firebaseApiKey} onChange={update} autoComplete="new-password" placeholder="Firebase Web API key" />
            </label>
            <label>
              Firebase auth domain
              <input name="firebaseAuthDomain" value={settings.firebaseAuthDomain} onChange={update} placeholder="your-project.firebaseapp.com" />
            </label>
            <div className="otp-settings-row">
              <label>
                Firebase project ID
                <input name="firebaseProjectId" value={settings.firebaseProjectId} onChange={update} placeholder="your-project-id" />
              </label>
              <label>
                Firebase app ID
                <input name="firebaseAppId" value={settings.firebaseAppId} onChange={update} placeholder="1:123456789:web:abcdef" />
              </label>
            </div>
            <span className={`otp-provider-status ${configured.firebaseConfigured ? 'configured' : ''}`}>
              {configured.firebaseConfigured ? 'Firebase SMS configured' : 'Firebase SMS not configured'}
            </span>
          </fieldset>

          <fieldset>
            <legend>Email OTP (Resend)</legend>
            <p>Use a Resend API key and a sender address from a domain verified in Resend. The code is sent to the email address registered on the account.</p>
            <label>
              Resend API key {configured.resendConfigured && <small>Configured; leave blank to keep the saved key.</small>}
              <input name="resendApiKey" type="password" value={settings.resendApiKey} onChange={update} autoComplete="new-password" placeholder={configured.resendConfigured ? 'Saved securely' : 're_...'} />
            </label>
            <label>
              Verified sender email
              <input name="resendFromEmail" type="email" value={settings.resendFromEmail} onChange={update} placeholder="no-reply@yourdomain.com" />
            </label>
            <span className={`otp-provider-status ${configured.resendConfigured ? 'configured' : ''}`}>
              {configured.resendConfigured ? 'Resend email OTP configured' : 'Resend email OTP not configured'}
            </span>
          </fieldset>
        </div>
        <fieldset className="otp-purpose-switches">
          <legend>Provider switches by OTP purpose</legend>
          <p>These switches control both sending and verifying OTPs for account creation, sign-in, password reset, and guest upgrade. Root Portal verification remains separate. Telegram account creation also requires its Login Widget switch above.</p>
          <div className="otp-purpose-table">
            <div className="otp-purpose-row otp-purpose-heading">
              <strong>Purpose</strong><strong>SMS</strong><strong>Telegram</strong><strong>Firebase SMS</strong><strong>Email</strong>
            </div>
            {[
              ['registration', 'Create account'],
              ['login', 'Sign in'],
              ['password_reset', 'Password reset'],
              ['upgrade', 'Guest upgrade'],
            ].map(([purpose, label]) => (
              <div className="otp-purpose-row" key={purpose}>
                <strong>{label}</strong>
                {['sms', 'telegram', 'firebase_sms', 'email'].map(channel => (
                  <label key={channel} aria-label={`${label}: ${channel}`}>
                    <input
                      type="checkbox"
                      checked={settings.purposeMethods[purpose]?.[channel] !== false}
                      onChange={() => togglePurposeMethod(purpose, channel)}
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        <button className="otp-settings-save" type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save OTP settings'}
        </button>
      </form>
    </section>
  )
}

export default OtpDeliverySettings
