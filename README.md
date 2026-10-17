# Personal Work Dashboard

> A beautiful pink-themed personal work command center for managing tasks, notes, meetings, team cascades, and Slack alerts — all in one application with reliable reminders and push notifications.

## Features

- ✅ **Pink-Themed Dashboard** — Soft pink, blush, dusty rose, and pastel accents with a polished, welcoming design
- ✅ **Task Manager** — Add, edit, delete, organize, set priorities (Urgent/High/Normal/Low), due dates, reminders, checklists, categories, and statuses (Pending/In Progress/Completed)
- ✅ **Automatic Archiving** — Completed tasks move to archive automatically; restore anytime
- ✅ **Full-Window Alerts** — Prominent pink overlay for urgent tasks when the dashboard is open
- ✅ **Desktop Notifications** — System-level notifications when the browser permits
- ✅ **Phone Push Notifications** — PWA with Web Push for Android; documented iPhone setup
- ✅ **Scheduled Reminders** — Background job scheduler runs every 5 minutes to check for due tasks and cascades
- ✅ **Important Notes** — Create, edit, pin, tag, search, archive, and restore notes; Quick Note feature
- ✅ **Meeting Notes** — Structured meeting records with attendees, agenda, decisions, action items; convert action items to tasks
- ✅ **Team Cascades** — Track announcements from "To Cascade" through "Cascaded" status with automatic reminders
- ✅ **Slack Integration** — OAuth-based Slack app; keyword/reaction-based alert capture; convert alerts to tasks or cascades
- ✅ **Search & Navigation** — Global search across all entity types; 9 dedicated pages
- ✅ **Data Persistence** — SQLite database; export/import functionality
- ✅ **PWA Support** — Installable on Android and iOS; offline-capable with service worker
- ✅ **Accessibility** — Keyboard navigation, screen-reader labels, visible focus states, color contrast compliance

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3, vanilla JavaScript (no framework) |
| **Backend** | Node.js + Express |
| **Database** | SQLite (via `sqlite3` npm package) |
| **Authentication** | JWT tokens (HS256) with PBKDF2 password hashing |
| **Push Notifications** | Web Push (VAPID keys) |
| **Service Worker** | Native browser service worker for PWA + push handling |
| **Scheduling** | Node.js `setInterval` (5-minute intervals) |
| **Deployment** | Node.js application server (can run on any Node-compatible host) |

## Repository Structure

```
personaldashboard/
├── server.js                    # Main Express server + all API routes
├── package.json                 # Node.js dependencies
├── .env.example                 # Template for environment variables
├── .env                         # Your environment (NOT committed)
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml           # CI/CD deployment workflow
├── src/
│   ├── db.js                    # SQLite database initialization
│   ├── auth.js                  # Authentication (JWT, PBKDF2)
│   ├── tasks.js                 # Task CRUD + history + archiving
│   ├── data.js                  # Notes, meetings, cascades, Slack alerts, settings
│   ├── notifications.js         # Web Push notifications
│   └── scheduler.js             # Background reminder scheduler
├── test/
│   └── integration.js           # Integration tests (18 tests)
└── public/
    ├── dashboard.html           # Main SPA HTML
    ├── dashboard.js             # Frontend app (routing, rendering, alerts)
    ├── sw.js                    # Service worker (PWA, push, offline)
    ├── manifest.json            # PWA manifest
    ├── icons/
    │   ├── icon-192.png         # PWA icon (192x192)
    │   └── icon-512.png         # PWA icon (512x512)
    └── assets/
        ├── styles.css           # Pink-themed stylesheet
        ├── api.js               # API client
        └── icons.js             # Icon definitions
```

## Local Development

### Prerequisites
- Node.js >= 20
- npm

### Setup

1. Clone the repository:
```bash
git clone https://github.com/daniellecrizaldo781/personaldashboard.git
cd personaldashboard
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment template:
```bash
cp .env.example .env
```

4. **Generate VAPID keys for push notifications** (required for phone notifications):
```bash
node -e "const w = require('web-push'); console.log(w.generateVAPIDKeys())"
```
Then paste the `publicKey` and `privateKey` into your `.env` file:
```
VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
```

5. (Optional) Set a custom admin password in `.env`:
```
ADMIN_PASSWORD=your_secure_password
```

6. Start the server:
```bash
npm start
# or for development with auto-restart:
npm run dev
```

7. Open your browser and go to:
```
http://localhost:3000/dashboard.html
```
- **Username:** `admin`
- **Password:** (whatever you set in `ADMIN_PASSWORD`, default: `changeme`)

### Running Tests

```bash
# Start the server first
npm start

# In a separate terminal, run tests:
node test/integration.js
```

## Database Configuration

The application uses **SQLite** by default — no separate database server is required. The database file is stored at the path specified by `DB_PATH` in your `.env` file (default: `./data/dashboard.db`).

The database is initialized automatically on server start. All tables (tasks, notes, meetings, cascades, slack_alerts, notification_history, push_subscriptions, settings, users, task_history, slack_tokens, slack_channels) are created with proper schema.

## Authentication Setup

- Authentication uses **JWT (JSON Web Tokens)** with HS256 signing.
- A session secret must be set via `SESSION_SECRET` in `.env`.
- Passwords are hashed with **PBKDF2** (SHA-512, 10,000 iterations) with a random salt.
- An initial `admin` user is created automatically on first launch using the `ADMIN_PASSWORD` from `.env`.
- After setup, you can log in with your credentials.

## Environment Variables and Secrets

### Local Development (.env file)

```env
SESSION_SECRET=your_session_secret_here            # Required: JWT signing key (32+ chars)
ADMIN_PASSWORD=your_admin_password_here             # Required: Initial admin password
BASE_URL=https://daniellecrizaldo.com               # Your custom domain
DB_PATH=./data/dashboard.db                        # SQLite database path
VAPID_PUBLIC_KEY=your_vapid_public_key            # Required for push notifications
VAPID_PRIVATE_KEY=your_vapid_private_key          # Required for push notifications
VAPID_SUBJECT=mailto:you@example.com              # Email for VAPID subject
SLACK_CLIENT_ID=your_slack_client_id              # Slack OAuth (optional)
SLACK_CLIENT_SECRET=your_slack_secret             # Slack OAuth (optional)
SLACK_SIGNING_SECRET=your_slack_signing_secret    # Slack webhook verification (optional)
SLACK_REDIRECT_URI=https://yoursite.com/auth/slack/callback
SLACK_TEAM_ID=your_team_id                        # Optional: restrict to one workspace
NODE_ENV=production
PORT=3000
```

### GitHub Secrets (for deployment)

| Secret Name | Description |
|------------|-------------|
| `SESSION_SECRET` | JWT signing secret |
| `ADMIN_PASSWORD` | Initial admin password |
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key |
| `SLACK_CLIENT_ID` | Slack OAuth client ID |
| `SLACK_CLIENT_SECRET` | Slack OAuth client secret |
| `SLACK_SIGNING_SECRET` | Slack webhook signing secret |

**Never commit real credentials to the repository.** Use `.env` files locally and GitHub Secrets for deployment.

## Slack App Setup

### Step 1: Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"** → **"From scratch"**
3. Enter app name: `Personal Dashboard`
4. Select your workspace

### Step 2: Configure OAuth & Permissions

Go to **OAuth & Permissions** and add these scopes:

**Bot Token Scopes:**
- `channels:read` — List public channels
- `channels:history` — Read message history in public channels
- `chat:read` — Read messages
- `chat:write` — Send messages (for test alerts)
- `users:read` — Get user info
- `reactions:read` — Read reactions (for urgency detection)

Click **"Install to Workspace"** and save the tokens.

### Step 3: Configure Event Subscriptions (optional, for real-time alerts)

Go to **Event Subscriptions** → toggle **Enable Events** → **"Subscribe to workspace events"**.

Add these bot events:
- `message.channels` — Messages posted to public channels

Set the **Request URL** to:
```
https://daniellecrizaldo.com/api/slack/webhook
```

### Step 4: Configure Redirect URLs

Go to **OAuth & Permissions** → **Redirect URLs** and add:
```
https://daniellecrizaldo.com/api/slack/oauth/callback
```

### Step 5: Connect Slack to Dashboard

1. Start the server
2. Visit `http://localhost:3000/api/slack/oauth/start` (or click the "Connect Slack" button in Settings)
3. You'll be redirected to Slack to authorize
4. After authorization, channels will be stored in the database automatically

### Step 6: Configure Alert Rules

In the dashboard **Settings** → **Notifications** tab, configure:
- **Urgency keywords** — Messages containing these words are captured (default: `urgent`, `asap`, `blocker`)
- **Watched channels** — Select which channels to monitor
- **Reactions** — Messages with certain reactions are flagged

## Phone Push Notifications

### Android Setup

1. Open the dashboard in **Chrome** on your Android phone
2. The browser will prompt you to allow notifications — tap **"Allow"**
3. Optionally, add to Home Screen: Chrome menu → **"Add to Home screen"**
4. The notification will show on your phone even when the dashboard is closed

### iPhone/iOS Setup

> **Note:** Web Push notifications on iOS require iOS 16.4 or later.

1. Open the dashboard in **Safari** (not Chrome — Apple restricts push to Safari)
2. Tap the **Share** button (square with arrow)
3. Tap **"Add to Home Screen"**
4. Open the app from your Home Screen
5. You'll be prompted to allow notifications — tap **"Allow"**
6. Push notifications will now be delivered to your iPhone

### If Web Push Doesn't Work

If your device/browser doesn't support Web Push:
- The dashboard will still show **full-window alerts** when the dashboard is open
- **Desktop system notifications** work when the browser tab is open
- **In-app notification history** is always available in the Notifications page
- Consider using **email-to-task** rules (e.g., via IFTTT/Zapier) as a fallback

### Managing Devices

- Go to **Settings** → **Devices** tab
- Each subscribed device is listed with its endpoint and subscription date
- Click **"Remove"** to unsubscribe a specific device
- Use the **"Send Test Notification"** button to verify delivery

## Browser Notification Permissions

The dashboard requests notification permission when you first visit. If you denied permission:

1. Click the lock icon (🔒) in your browser's address bar
2. Change **Notifications** from "Blocked" to "Allow"
3. Refresh the page

**Note:** Some browsers require the site to be served over **HTTPS** for push notifications to work. Local development uses `http://localhost` which browsers treat as a secure context.

## PWA Installation

### Android

1. Open the dashboard in **Chrome**
2. Tap the three-dot menu (⋮) → **"Add to Home screen"**
3. Tap **"Add"** in the confirmation dialog
4. The app icon will appear on your Home Screen
5. Launching from the icon opens the dashboard as a standalone app (no browser Chrome)

### iPhone/iPad

1. Open the dashboard in **Safari**
2. Tap the **Share** button (square with arrow pointing up)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"** in the top-right corner
5. The app icon will appear on your Home Screen
6. **For push notifications:** After adding to Home Screen, open the app and allow notification permissions

## Scheduled Reminder Architecture

The dashboard uses a **server-side background scheduler** that runs every 5 minutes (configurable in `src/scheduler.js`). This ensures reminders fire even when the browser is closed.

### How it works:

1. **Scheduler** (`src/scheduler.js`): Runs `checkAndSendReminders()` every 5 minutes via `setInterval`
2. **Reminder Check**: Queries the database for tasks with:
   - Due dates within the reminder window
   - Approaching deadlines
   - Overdue tasks
   - Urgent tasks that are still In Progress
   - Cascades past their deadline
3. **Push Delivery**: Sends push notifications to all subscribed devices via the Web Push protocol
4. **In-App Alerts**: Logs notifications to the `notification_history` table for full-window alerts and notification history
5. **Duplicate Prevention**: Tracks `last_reminded` timestamp on each task/cascade to prevent repeated reminders within the cooldown period

### Hosting Requirements for Reminders

The scheduler requires the server process to remain running. Hosting options:

| Hosting | Scheduler Support | Notes |
|---------|------------------|-------|
| **Render / Fly.io / Railway** | ✅ Yes | Node.js service runs continuously |
| **Heroku** | ✅ Yes (paid) | Use the free tier for testing only |
| **VPS (DigitalOcean, Linode)** | ✅ Yes | Full control over the environment |
| **GitHub Actions** | ⚠️ Limited | Can run on a cron schedule, but not ideal |
| **Netlify / Vercel** | ❌ No | Static hosting only; use serverless instead |
| **Self-hosted** | ✅ Yes | Run `npm start` as a systemd service |

## Domain and DNS Setup

### Custom Domain: `daniellecrizaldo.com`

1. **Point DNS records to your hosting:**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | Your server IP | 300 |
| A | www | Your server IP | 300 |
| CNAME | kbs | Your server IP (or CNAME) | 300 |

2. **Configure HTTPS:**
   - For **PWA and push notifications**, HTTPS is required
   - Use **Let's Encrypt** (free) or your hosting provider's SSL
   - For local development, `http://localhost` is treated as secure by browsers

3. **Set `BASE_URL` in `.env`:**
```env
BASE_URL=https://daniellecrizaldo.com
```

4. **Configure `SLACK_REDIRECT_URI`:**
```env
SLACK_REDIRECT_URI=https://daniellecrizaldo.com/api/slack/oauth/callback
```

### Verifying Deployment

After deployment, verify:
1. `https://daniellecrizaldo.com/dashboard.html` loads
2. Login works with your credentials
3. API returns data (check browser DevTools → Network tab)
4. Push notifications work (subscribe + send test notification)
5. Scheduler is running (check server logs for "Background reminder scheduler started")

## Production Deployment

### Option A: Self-hosted VPS (Recommended)

1. **Provision a server** (Ubuntu 22.04 recommended):
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 (process manager)
sudo npm install -g pm2

# Clone and install
git clone https://github.com/daniellecrizaldo781/personaldashboard.git
cd personaldashboard
npm install

# Copy and configure .env
cp .env.example .env
# Edit .env with your values

# Start with PM2
pm2 start server.js --name "dashboard"
pm2 startup
pm2 save
```

2. **Set up Nginx reverse proxy + HTTPS:**
```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d daniellecrizaldo.com
```

### Option B: Platform-as-a-Service (Render)

1. Create a **Web Service** on [Render](https://render.com)
2. Connect your GitHub repo
3. Set build command: `npm install`
4. Set start command: `node server.js`
5. Add environment variables from your `.env`
6. Configure custom domain in Render's dashboard

### Option C: GitHub Actions + VPS

The included `.github/workflows/deploy.yml` can be configured to auto-deploy on push.

## Backup and Data Export

### Manual Export

The dashboard includes a built-in export feature:
1. Go to **Settings** → **Data** tab
2. Click **"Export All Data"**
3. A `dashboard-export.json` file is downloaded with all records

### Automated Backup

Set up a cron job to export the SQLite database:
```bash
# Daily backup at 2 AM
0 2 * * * cp /path/to/data/dashboard.db /backup/dashboard-$(date +%Y%m%d).db
```

### Database Location

By default, the SQLite database is at `./data/dashboard.db` (relative to the project directory). Change this with the `DB_PATH` environment variable.

## Troubleshooting

### Common Issues

#### "Cannot POST /api/auth/login"
- **Cause:** The Express server isn't handling JSON bodies correctly
- **Fix:** Ensure `express.json()` middleware is loaded (it is by default in `server.js`)

#### "Invalid token" error
- **Cause:** The JWT token has expired or is malformed
- **Fix:** Log out and log back in

#### Push notifications not working
1. Check that `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set in `.env`
2. Ensure the browser is over HTTPS (except localhost)
3. Check browser notification permissions
4. Verify the subscription is saved: check the **Settings → Devices** page

#### Slack OAuth fails
1. Verify `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` are correct
2. Ensure the redirect URI matches exactly (including https://)
3. Check that the Slack app has the required scopes installed

#### "Device or resource busy" on database
- **Cause:** Another server process is using the database file
- **Fix:** Stop all server processes before restarting: `pkill -f node`

#### Service worker not registering
1. Ensure you're serving over HTTPS (or localhost)
2. Check the browser console for errors
3. Clear browser cache and unregister old service workers

#### Task not archiving after completion
- Tasks are archived when their status changes to `Completed`
- Check that the `completeTask` API endpoint is being called
- Verify the task appears in the "Completed Tasks" page

### Getting Help

1. Check server logs for error messages
2. Verify all environment variables are set
3. Run the integration tests: `node test/integration.js`

## Security Considerations

### What's Protected:
- ✅ **Passwords** are hashed with PBKDF2 (SHA-512, 10,000 iterations + salt)
- ✅ **JWT tokens** are signed with `SESSION_SECRET` and expire after 7 days
- ✅ **Slack tokens** are stored encrypted in the database (server-side only)
- ✅ **VAPID keys** are never exposed to the frontend
- ✅ **All API routes** require authentication (except login)
- ✅ **Environment variables** are loaded from `.env` (never committed)
- ✅ **Rate limiting** is applied to all API endpoints

### What You Must Do:
1. **Set a strong `SESSION_SECRET`** — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
2. **Set a strong `ADMIN_PASSWORD`** — change from the default
3. **Generate your own VAPID keys** — do not use the example values
4. **Use HTTPS in production** — required for push notifications
5. **Rotate credentials** if they were ever committed to Git history
6. **Regularly back up** your SQLite database

### Credential Rotation Checklist

If a credential was potentially exposed:
1. Generate new credentials
2. Update all environment variables/secrets
3. Restart the server
4. Revoke old Slack app tokens from the Slack API dashboard
5. Generate new VAPID keys
6. Re-subscribe devices for push notifications

---

## License

MIT

---

**Built with ❤️ and 💗 by an AI assistant for Danielle.**
