# RED SEA — Commission & Brokerage Platform

Full-stack web application for managing fixed and movable commission work and brokerage services.
Built with **React + Vite** (frontend) and **Node.js + Express** (backend) using **SQLite** database.

---

## 🔐 Login Credentials

Sign in with an active account created in the application. Root Portal access requires an active `root` or `admin` account and its account password or a phone OTP. Do not rely on shared or hard-coded passwords.

## 📲 Phone OTP Setup

Root administrators can configure delivery in **Root Dashboard → OTP API → OTP Delivery Settings**. Available methods appear in the login/password-reset delivery dropdown after they are configured.

- **SMS:** Set the provider's HTTPS endpoint, API token, authorization header/prefix, optional sender ID, and JSON request body. The JSON template can use `{{phone}}`, `{{message}}`, `{{otp}}`, and `{{sender}}` placeholders.
- **Telegram:** Save the bot token and the root recipient's numeric private chat ID in **Root Dashboard → OTP API → OTP Delivery Settings**. The recipient must first start the bot. Root Portal login and password-reset codes use this configured chat. Regular accounts need to start the bot and link a verified chat in **My Profile → Telegram OTP sign-in**; Telegram bots cannot send messages to phone numbers alone. To enable Telegram Login Widget sign-in on the user and root login portals, also save the bot's username and configure the website domain with BotFather using `/setdomain`. Regular accounts must have Telegram linked before using the widget. Root sign-in uses a linked root account, or the configured root chat ID when there is exactly one active root/admin account. Telegram OTP remains available for password reset.
- **Telegram support link:** Configure the support Telegram username in **Root Dashboard → OTP API → OTP Delivery Settings**. The **Telegram Support** link appears in the signed-in site header and at the top of the login page, and opens `https://t.me/<username>`.
- **Firebase SMS:** Configure the Firebase Web API key, auth domain, project ID, and app ID. Enable Phone Authentication in Firebase and add the site's domain to its authorized domains. The browser uses Firebase's reCAPTCHA and phone verification; the backend verifies the Firebase phone session before logging in or resetting a password. Enter the phone number in international `+<country code>...` format.
- **Email OTP (Resend):** Save a Resend API key and a sender address from a verified Resend domain. Users enter the email address registered on their account; the backend sends and verifies the expiring code.
- Provider tokens are encrypted in the SQLite database and are not returned to the browser. Keep `OTP_ENCRYPTION_KEY` stable to preserve saved settings; existing installations without it continue using `JWT_SECRET` and are migrated automatically when the new key is configured.
- Codes expire after 10 minutes, allow up to 5 verification attempts, and are rate-limited per phone and source connection.

SMS and Telegram phone OTP are available for regular account login, password reset, guest-to-user account upgrades, and root-portal login/password reset. Firebase SMS and Resend email OTP are available for regular and root account login/password reset. Delivery is selected per request.

## 💬 Live Support

The floating support chat sends messages to the Root Dashboard → Live Chat Control. Conversations, images, files, and recorded voice messages are persisted in SQLite; attachments are limited to 6 MB each. Audio and video calls use browser WebRTC, so both participants need microphone permission, video calls also need camera permission, and the site must be served over HTTPS (localhost is also supported). **A phone opened with an `http://<LAN-IP>` URL cannot use the microphone or camera; configure HTTPS for phone access.** For an HTTPS production site, configure the web server to proxy the same-origin `/api/v1` path to the Node.js backend; production builds use this path to avoid mixed-content HTTP API requests. During calls, participants can mute their microphone, turn their camera off, or mute the remote speaker. The root operator can request a call recording; recording starts only after the other participant consents. When the call ends, the root operator can save or discard the recording. Saved recordings are stored in IndexedDB in that browser and are available from the Live Chat Control → Saved tab on that device; they are not uploaded to the server.

Live support is available before sign-in, on the login page, and after sign-in. Guest chats are separated by browser/device; signed-in chats are separated by account and device. Root/Admin support can identify each conversation by guest/account role and device ID. The sound control only toggles chat notifications and does not modify messages.

For calls across networks, configure `VITE_WEBRTC_ICE_SERVERS` as a JSON array of WebRTC ICE server objects; include a TURN relay for networks that block direct peer connections. TURN credentials are delivered to browsers, so use short-lived credentials from your relay provider. For example, set it in the frontend `.env` before building:

```env
VITE_WEBRTC_ICE_SERVERS=[{"urls":"stun:stun.example.com:3478"},{"urls":"turn:turn.example.com:3478","username":"<short-lived-username>","credential":"<short-lived-credential>"}]
```

If `VITE_WEBRTC_ICE_SERVERS` is not set, the app keeps using `VITE_WEBRTC_STUN_URLS` (comma-separated STUN URLs) or the default public STUN server. STUN-only connections may fail behind restrictive NATs or firewalls; no TURN relay is bundled.

In **Root Dashboard → Chat Control → User messages**, use **Root direct message** to send a private message to the selected account as Root. User-to-user threads in that view are read-only; calls are available in live support and private friend conversations.

Private friend conversations in the **Message** quick action also support recorded voice messages and one-to-one WebRTC voice/video calls. The browser requests microphone access when the user taps voice recording or voice call, and requests camera access when the user taps video call or accepts one. Incoming calls are shown while the recipient's signed-in app is open in a foreground browser; calls do not ring offline or after the app is closed. Mobile access requires HTTPS. The same `VITE_WEBRTC_ICE_SERVERS` settings above apply; TURN is recommended for calls across restrictive networks.

## 🛍️ Homepage Promotions & Service Catalog

Root administrators manage published service products under **Root Dashboard → Services**. The homepage and matching service-category pages read the shared catalog from SQLite, so publishing, hiding, editing, boosting, and deleting a catalog product applies across accounts and devices. The utility-payment page is not included in marketplace listings.
Catalog product and digital-product forms include a customer-facing description. Physical products can optionally offer delivery with a configured ETB fee. Customers may request delivery while booking; that fee is separate from checkout and payable on receipt. Root can track requested, preparing, out-for-delivery, and delivered states in both the **Booked Services** and **Service Payments** views. Level-up ETB bonuses are credited to the bonus wallet and shown in a celebratory dialog; reward reminders remain in the header for 24 hours.

Use **Root Dashboard → Promotions & Boosts** to create banner promotions and alerts, set the banner color, audience status, badge, button, and pinned/notification behavior, and edit, hide, unhide, or delete each promotion. Visible promotions rotate on the homepage every three seconds and alert-enabled promotions appear in the notification popup.
The **Reward rules** tab begins with a current-status overview of role rewards, coin-level ETB bonuses, link-view rewards, campaign prices, and each Daily Claim game’s enabled state, play limit, and segment amounts. The public header’s **How to earn & claim** guide explains claim steps and, for signed-in users, shows their progress, available game plays, and current configured reward amounts. **Root Dashboard → Website Header & Footer** includes the editable Terms & Conditions text shown in the footer popup.

Users can request a boost for a public product post from the feed by selecting a configured payment method, entering an ETB amount and payment reference, and optionally attaching proof. Root reviews the submitted method and payment details in the same dashboard tab; approval promotes the post to the top of the feed and service-category listings, and root can later unboost it. Boost requests are manual-payment review requests; they do not charge a payment provider automatically.

The Feed also includes **Daily Claim** games (Spin & Win, Lucky Slots, and Boom Mine). Signed-in users receive server-credited coin rewards from the configured game segments. Each game has its own play limit in a rolling 24-hour window; expired plays become available again automatically. Root administrators can enable games, edit segment labels and coin amounts, and set the per-game play limit under **Root Dashboard → Promotions & Boosts → Reward rules**.
Feed post location, mention, hashtag, and friend-tag fields suggest matching locations and hashtags from posts and people while typing.

---

## 🌐 Access URLs

| Where              | URL                              |
|--------------------|----------------------------------|
| This PC (custom)   | `http://www.redsea.com`          |
| This PC (custom)   | `http://redsea.com`              |
| This PC (by IP)    | `http://192.168.x.x`             |
| Mobile / Phone     | `https://192.168.x.x:3001`       |
| Backend API        | `http://192.168.x.x:5000/api/v1` |

> The `www.redsea.com` domain works only on devices where the hosts file has been updated.
> LAN HTTP URLs can load the app, but browsers block microphone and camera access on them. Configure trusted HTTPS below before using calls or voice messages from a phone. `localhost` works only on the device where the browser is running.

### HTTPS for development on a phone

Vite can serve the development app over HTTPS and proxy `/api/v1` requests to the local backend. This keeps the API on the same secure origin and avoids browser mixed-content blocking.

1. Install [mkcert](https://github.com/FiloSottile/mkcert) on the development PC.
2. In PowerShell, from the project folder, create a certificate for your current LAN IP (replace `192.168.x.x` with the PC's IP shown by `ipconfig`):

   ```powershell
   mkcert -install
   New-Item -ItemType Directory -Force .certs
   mkcert -key-file .certs\redsea-key.pem -cert-file .certs\redsea-cert.pem 192.168.x.x localhost 127.0.0.1
   ```

3. Create `.env.local` in the project folder:

   ```env
   VITE_HTTPS_CERT_FILE=.certs/redsea-cert.pem
   VITE_HTTPS_KEY_FILE=.certs/redsea-key.pem
   ```

4. Install the mkcert root certificate on the phone so its browser trusts the HTTPS certificate. Run `mkcert -CAROOT` on the PC to find `rootCA.pem`, then securely copy **only** `rootCA.pem` to the phone. On Android, install it as a CA certificate using the phone's Security settings; on iPhone/iPad, install the certificate profile and enable full trust under **Settings → General → About → Certificate Trust Settings**. Menus vary by device. Never copy or share `rootCA-key.pem`; it can issue trusted certificates.
5. Restart `START-ALL.bat` (or `npm run dev`) and, with the phone on the same Wi-Fi, open `https://192.168.x.x:3001` (replace the example IP with the one used to create the certificate). Allow microphone/camera access when prompted.

Without this setup, the LAN HTTP URL remains suitable for browsing but not microphone/camera access. This development HTTPS setup applies to Vite on port 3001; the XAMPP/production website needs its own HTTPS virtual host and publicly trusted certificate. For voice messages or calls, both participants must open the app over HTTPS (or use localhost on their own device).

---

## 🚀 Quick Start — Recommended

### Option A — One-Click Full Installer (www.redsea.com)

> Requires XAMPP to be installed. Right-click → **Run as administrator**.

```
INSTALL.bat
```

Does everything automatically:
1. Detects XAMPP and your network IP
2. Installs all Node.js dependencies
3. Builds the React frontend
4. Copies files to `XAMPP\htdocs\www.redsea.com\`
5. Writes Apache VirtualHost config
6. Adds `www.redsea.com` to Windows hosts file
7. Starts the Node.js backend on port 5000
8. Starts Apache on port 80

After it finishes → open **http://www.redsea.com** in your browser.

---

### Option B — XAMPP Setup (rebuilds and redeploys)

> Use this when you update the source code and want to redeploy.
> Right-click → **Run as administrator**.

```
XAMPP-SETUP.bat
```

Same as INSTALL.bat but skips the first-time dependency install check.
Use after code changes to rebuild and redeploy quickly.

---

### Option C — Development Mode (daily coding)

Double-click (no admin needed):

```
START-ALL.bat
```

- Starts backend API on port **5000**
- Starts Vite frontend dev server on port **3001**
- Auto-detects and updates IP in `.env` files
- Opens browser at `http://localhost:3001`
- Hot reload available for frontend changes
- To use microphone/camera from a phone, first configure HTTPS as described above and open the `https://<PC-LAN-IP>:3001` address Vite prints

---

### Option D — Production Mode (offline, no XAMPP)

Double-click (no admin needed):

```
BUILD-AND-SERVE.bat
```

- Builds the React app to `dist\`
- Serves it via Node.js on port **3000**
- Backend API on port **5000**
- No Vite, no XAMPP, no internet needed
- Access at `http://localhost:3000`

---

### Option E — Vercel Frontend + Render Backend

The repository includes `render.yaml` for a Render Node service using the existing Express backend and a persistent disk for SQLite. The Render blueprint generates `JWT_SECRET`, `OTP_ENCRYPTION_KEY`, and a first-install root password; save the generated root password from Render's environment settings. Keep both generated secrets stable across deployments.

1. Push the project to GitHub and import the repository into Vercel. Keep the frontend root directory at the repository root, with build command `npm run build` and output directory `dist`.
2. Deploy the backend from the same repository on Render using the `render.yaml` Blueprint. Set `CORS_ORIGIN` to the exact deployed frontend origin (for example, `https://your-project.vercel.app`) in the Render service environment settings. Do not include a path or trailing slash.
3. Copy the Render service's public HTTPS URL. In **Vercel → Project → Settings → Environment Variables**, set `VITE_API_URL` to that URL plus `/api/v1` (for example, `https://redsea-api.onrender.com/api/v1`) for Production and Preview as needed.
4. Redeploy the Vercel frontend after setting `VITE_API_URL`. Confirm the backend is healthy at `https://<render-host>/api/v1/health`.

Vercel and Render do not read the local root `.env` or `backend/.env` files for hosted deployments. Configure frontend variables in Vercel and backend variables in Render. Never put `JWT_SECRET`, `OTP_ENCRYPTION_KEY`, database credentials, root passwords, or provider tokens in `VITE_*` variables; Vite exposes them in browser code. The Render blueprint requires a paid instance with a persistent disk for SQLite. It starts with a new empty database; the SQLite data in your local `backend/database_files` folder is not automatically migrated.

---

### Stop All Servers

```
STOP-ALL.bat
```

Kills all Node.js processes and frees ports 3000, 3001, 5000.

---

### Show Network Info

```
SHOW-NETWORK-INFO.bat
```

Shows your IP address, which servers are running, mobile access URLs,
and offers to open Windows Firewall settings and QR code generator.

---

### Uninstall www.redsea.com

> Right-click → **Run as administrator**.

```
UNINSTALL.bat
```

Removes:
- `www.redsea.com` from Windows hosts file
- Apache VirtualHost config block
- `XAMPP\htdocs\www.redsea.com\` folder

Does NOT remove your source code, XAMPP, or Node.js.

---

## 📱 Mobile / Phone Access

Phones and other devices cannot use `www.redsea.com` unless you manually
add the hosts entry on that device. The easiest way is to use the IP directly.

### Steps

1. Run `SHOW-NETWORK-INFO.bat` — note your IP (e.g. `192.168.1.5`)
2. Connect your phone to the **same WiFi** as this PC
3. Open the phone browser and go to:

| Mode              | URL to open on phone              |
|-------------------|-----------------------------------|
| XAMPP (port 80)   | `http://192.168.1.5`              |
| Dev (port 3001)   | `http://192.168.1.5:3001`         |
| Production (3000) | `http://192.168.1.5:3000`         |

### QR Code (easiest for phone)

1. Go to [https://qr.io](https://qr.io)
2. Paste your URL (e.g. `http://192.168.1.5`)
3. Scan the QR with your phone camera — opens instantly

### Give phones the www.redsea.com domain (optional)

On Android/iPhone you can install a DNS or hosts-override app:
- **Android**: Use app `Virtual Hosts` or `DNS66`
- **iPhone**: Use app `DNS Override`
- Add entry: `192.168.x.x → www.redsea.com`

---

## 🔥 Firewall — Fix if Phone Cannot Connect

If the phone cannot reach the app, Node.js is being blocked by Windows Firewall.

**Fix:**
1. Open **Windows Security**
2. Go to **Firewall & Network Protection → Allow an app through firewall**
3. Click **Change settings** → **Allow another app**
4. Browse to `node.exe` (usually `C:\Program Files\nodejs\node.exe`)
5. Check both **Private** and **Public**
6. Click OK

Or run `SHOW-NETWORK-INFO.bat` and press **Y** when it asks to open Firewall.

---

## ⚙️ Ports Reference

| Service              | Port | URL                               |
|----------------------|------|-----------------------------------|
| Apache / XAMPP       | 80   | http://www.redsea.com             |
| Frontend Production  | 3000 | http://localhost:3000             |
| Frontend Dev (Vite)  | 3001 | http://localhost:3001             |
| Backend API (Node)   | 5000 | http://localhost:5000/api/v1      |

---

## 🗄️ Database

| Setting  | Value                             |
|----------|-----------------------------------|
| Type     | SQLite (file-based)               |
| Location | `backend\database\redsea.db`      |
| Setup    | Auto-created on first server start |
| Requires | Nothing — no MySQL, no MongoDB     |

To reset all data: delete `backend\database\redsea.db` and restart the backend.

---

## 🗂️ Project Structure

```
RED SEA WEB\
│
├── INSTALL.bat              ← ONE-CLICK INSTALLER (run as admin)
├── UNINSTALL.bat            ← Remove www.redsea.com setup (run as admin)
├── XAMPP-SETUP.bat          ← Rebuild + redeploy to XAMPP (run as admin)
├── START-ALL.bat            ← Dev mode: frontend (3001) + backend (5000)
├── BUILD-AND-SERVE.bat      ← Production mode: build + serve offline
├── STOP-ALL.bat             ← Kill all servers, free all ports
├── SHOW-NETWORK-INFO.bat    ← Show IP, URLs, mobile access info
├── README.md                ← This file
│
├── src\                     ← React source code
├── public\                  ← Static assets (images, icons)
├── dist\                    ← Built frontend (auto-created by build)
│
├── server.js                ← Node.js production server (serves dist\)
├── vite.config.js           ← Vite config (auto-detects network IP)
├── package.json             ← Frontend dependencies
├── .env                     ← Frontend environment (auto-updated by BAT files)
│
└── backend\
    ├── server.js            ← Express API server (port 5000)
    ├── .env                 ← Backend environment config
    ├── package.json         ← Backend dependencies
    ├── config\              ← Database manager, SQLite, MongoDB configs
    ├── controllers\         ← Business logic (auth, clients, transactions...)
    ├── routes\              ← API route definitions
    ├── middleware\          ← JWT auth, error handling
    └── database\           ← SQLite DB file + SQL migration scripts
```

---

## 🔧 Manual Setup (if BAT files don't work)

### Requirements
- [Node.js 16+](https://nodejs.org) — must be installed first
- [XAMPP](https://www.apachefriends.org) — for www.redsea.com domain mode

### Step 1 — Install dependencies

```bash
# In RED SEA WEB\ folder:
npm install

# In RED SEA WEB\backend\ folder:
npm install
```

### Step 2 — Start the backend

```bash
# In RED SEA WEB\backend\ folder:
node server.js
```

Backend runs at `http://localhost:5000/api/v1`

### Step 3 — Start the frontend (dev mode)

```bash
# In RED SEA WEB\ folder:
npx vite --host 0.0.0.0 --port 3001
```

Frontend runs at `http://localhost:3001`

### Step 4 — OR build for production

```bash
# In RED SEA WEB\ folder:
npm run build
node server.js
```

Frontend runs at `http://localhost:3000`

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---|---|
| Port already in use | Run `STOP-ALL.bat` then try again |
| `www.redsea.com` not opening | Run `INSTALL.bat` as administrator |
| Phone can't connect | Check Windows Firewall (see above). Same WiFi? |
| Build fails | Delete `node_modules\` and run `npm install` again |
| Backend won't start | Delete `backend\database\redsea.db` and restart |
| Blank white screen | Wait 15 seconds — Vite is loading. Refresh. |
| Apache not starting | Check XAMPP Control Panel — port 80 may be taken by Skype or IIS |
| Port 80 conflict | In XAMPP → Apache → Config → change port to 8080, use `http://www.redsea.com:8080` |
| XAMPP not found | When running BAT files, enter XAMPP path manually when prompted |
| Lost IP address | Run `SHOW-NETWORK-INFO.bat` |

---

## 👥 User Roles

| Role    | What they can do |
|---------|-----------------|
| Root    | Full system access — manage all users, settings, data |
| Admin   | Manage users, clients, transactions, view all reports |
| Manager | Manage clients and transactions, view reports |
| Agent   | Create and update clients and transactions |
| Staff   | Basic data entry and view only |

---

## 🔑 API Quick Reference

Base URL: `http://localhost:5000/api/v1`

| Method | Endpoint                    | Description                |
|--------|-----------------------------|----------------------------|
| POST   | `/auth/login`               | Login, returns JWT token   |
| POST   | `/auth/otp/send`            | Send a login/reset/upgrade/root OTP |
| POST   | `/auth/otp/verify`          | Verify an OTP and complete its flow |
| GET    | `/auth/otp/config`          | Read public OTP provider availability and Firebase web configuration |
| POST   | `/auth/otp/firebase/verify` | Verify a Firebase phone session and complete login/reset |
| POST   | `/auth/root/login`          | Root/admin username and password login |
| GET    | `/root/otp-settings`        | Read masked OTP delivery settings (root) |
| PUT    | `/root/otp-settings`        | Save OTP delivery settings (root) |
| GET    | `/live-chat/conversations/:id/messages` | Read public support conversation |
| POST   | `/live-chat/conversations/:id/messages` | Send customer message or attachment |
| GET    | `/live-chat/admin/conversations` | List conversations (root/admin) |
| POST   | `/live-chat/admin/conversations/:id/messages` | Reply as root/admin |
| GET    | `/auth/profile`             | Get logged-in user profile |
| GET    | `/clients`                  | List all clients           |
| POST   | `/clients`                  | Create a new client        |
| GET    | `/transactions`             | List all transactions      |
| POST   | `/transactions/fixed`       | Create fixed transaction   |
| POST   | `/transactions/movable`     | Create movable transaction |
| GET    | `/dashboard/stats`          | Dashboard statistics       |
| GET    | `/users`                    | List all users (admin)     |
| POST   | `/users`                    | Create new user (admin)    |
| GET    | `/data-registrations`       | List data registrations    |

Full API documentation: `backend\README.md`

---

## 📦 Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Frontend  | React 18, React Router 6, Vite 5        |
| Backend   | Node.js, Express.js 4                   |
| Database  | SQLite via better-sqlite3               |
| Auth      | JWT (jsonwebtoken), bcryptjs            |
| PDF       | jsPDF, jspdf-autotable                  |
| Excel     | xlsx                                    |
| Security  | Helmet, CORS, express-validator         |
| Web Server| Apache (XAMPP) or Node.js built-in      |

---

## 📋 All BAT Files Summary

| File | Admin Needed | Purpose |
|---|---|---|
| `INSTALL.bat` | ✅ Yes | Full first-time install with www.redsea.com |
| `UNINSTALL.bat` | ✅ Yes | Remove www.redsea.com setup completely |
| `XAMPP-SETUP.bat` | ✅ Yes | Rebuild and redeploy to XAMPP |
| `START-ALL.bat` | ❌ No | Start dev servers (Vite + Node) |
| `BUILD-AND-SERVE.bat` | ❌ No | Build + serve production offline |
| `STOP-ALL.bat` | ❌ No | Stop all servers, free all ports |
| `SHOW-NETWORK-INFO.bat` | ❌ No | Show IP, URLs, firewall, QR code |

---

*RED SEA Commission & Brokerage Platform — v1.0.0*
