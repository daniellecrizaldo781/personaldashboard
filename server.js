require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDatabase, getDb } = require('./src/db');
const { ensureAdminExists, middleware: authMiddleware } = require('./src/auth');
const { startScheduler } = require('./src/scheduler');
const { VAPID_PUBLIC_KEY } = require('./src/notifications');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS - allow requests from GitHub Pages / custom domain
const allowedOrigins = [
  'https://workcommandcenter.daniellecrizaldo.com',
  'https://daniellecrizaldo.com',
  'https://workcommandcenter-daniellecrizaldo-com.pages.dev',
  /^https:\/\/.*\.pages\.dev$/
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const isAllowed = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests' }
});
app.use('/api/', apiLimiter);

// Initialize database
initDatabase();

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// === AUTH ROUTES ===
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const user = await require('./src/auth').verifyUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = require('./src/auth').generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/setup', async (req, res) => {
  const { username, password, email } = req.body;
  const db = getDb();
  db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
    if (err || !row || row.count > 0) {
      return res.status(403).json({ error: 'Setup not allowed - users already exist' });
    }
    proceedWithSetup();
  });

  async function proceedWithSetup() {
    try {
      const user = await require('./src/auth').createUser(username || 'admin', password, email);
      const token = require('./src/auth').generateToken(user);
      res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
      console.error('Setup error:', err);
      res.status(500).json({ error: err.message });
    }
  }
});

app.get('/api/auth/me', authMiddleware(), (req, res) => {
  res.json({ user: req.user });
});

// === SETTINGS ROUTES ===
app.get('/api/settings', authMiddleware(), async (req, res) => {
  try {
    const { getSettings } = require('./src/data');
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', authMiddleware(), async (req, res) => {
  try {
    const { updateSetting } = require('./src/data');
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key required' });
    await updateSetting(key, value);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === VAPID KEY ROUTE ===
app.get('/api/push/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || '' });
});

// === PUSH SUBSCRIPTION ROUTES ===
app.post('/api/push/subscribe', authMiddleware(), async (req, res) => {
  try {
    const { saveSubscription } = require('./src/data');
    await saveSubscription(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/push/subscriptions', authMiddleware(), async (req, res) => {
  try {
    const { getAllSubscriptions } = require('./src/data');
    const subs = await getAllSubscriptions();
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/push/subscriptions/:endpoint', authMiddleware(), async (req, res) => {
  try {
    const { removeSubscription } = require('./src/data');
    // Decode endpoint from URL param
    const endpoint = req.params.endpoint;
    await removeSubscription(decodeURIComponent(endpoint));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/push/test', authMiddleware(), async (req, res) => {
  try {
    const { getAllSubscriptions, logNotification } = require('./src/data');
    const { sendPushNotification } = require('./src/notifications');
    const subs = await getAllSubscriptions();
    if (subs.length === 0) {
      return res.status(400).json({ error: 'No push subscriptions found' });
    }

    const payload = {
      title: 'Test Notification',
      body: 'This is a test notification from your Personal Dashboard',
      priority: 'Normal',
      tag: 'test-notification',
      url: '/',
      data: { type: 'test' }
    };

    const results = [];
    for (const sub of subs) {
      const result = await sendPushNotification({
        endpoint: sub.endpoint,
        keys: sub.keys ? JSON.parse(sub.keys) : {}
      }, payload);
      results.push(result);
    }

    await logNotification({
      source: 'System',
      source_id: 'test',
      title: payload.title,
      body: payload.body,
      priority: 'Normal',
      status: 'sent'
    });

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === TASKS ROUTES ===
app.get('/api/tasks', authMiddleware(), async (req, res) => {
  try {
    const { getAllTasks } = require('./src/tasks');
    const tasks = await getAllTasks(req.query);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Archived tasks (must be before /:id to avoid param matching)
app.get('/api/tasks/archived', authMiddleware(), async (req, res) => {
  try {
    const { getArchivedTasks } = require('./src/tasks');
    const tasks = await getArchivedTasks(req.query.search);
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id', authMiddleware(), async (req, res) => {
  try {
    const { getTask } = require('./src/tasks');
    const task = await getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', authMiddleware(), async (req, res) => {
  try {
    const { createTask } = require('./src/tasks');
    const task = await createTask(req.body);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', authMiddleware(), async (req, res) => {
  try {
    const { updateTask } = require('./src/tasks');
    const task = await updateTask(req.params.id, req.body);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id/complete', authMiddleware(), async (req, res) => {
  try {
    const { completeTask } = require('./src/tasks');
    const result = await completeTask(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id/restore', authMiddleware(), async (req, res) => {
  try {
    const { restoreTask } = require('./src/tasks');
    const task = await restoreTask(req.params.id);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', authMiddleware(), async (req, res) => {
  try {
    const { deleteTask } = require('./src/tasks');
    const result = await deleteTask(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === NOTES ROUTES ===
app.get('/api/notes', authMiddleware(), async (req, res) => {
  try {
    const { getAllNotes } = require('./src/data');
    const notes = await getAllNotes(req.query);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notes', authMiddleware(), async (req, res) => {
  try {
    const { createNote } = require('./src/data');
    const note = await createNote(req.body);
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notes/:id', authMiddleware(), async (req, res) => {
  try {
    const { getNote } = require('./src/data');
    const note = await getNote(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notes/:id', authMiddleware(), async (req, res) => {
  try {
    const { updateNote } = require('./src/data');
    const note = await updateNote(req.params.id, req.body);
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notes/:id/archive', authMiddleware(), async (req, res) => {
  try {
    const { archiveNote } = require('./src/data');
    const result = await archiveNote(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notes/:id', authMiddleware(), async (req, res) => {
  try {
    const { deleteNote } = require('./src/data');
    const result = await deleteNote(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === MEETINGS ROUTES ===
app.get('/api/meetings', authMiddleware(), async (req, res) => {
  try {
    const { getAllMeetings } = require('./src/data');
    const meetings = await getAllMeetings(req.query);
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meetings', authMiddleware(), async (req, res) => {
  try {
    const { createMeeting } = require('./src/data');
    const meeting = await createMeeting(req.body);
    res.status(201).json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/meetings/:id', authMiddleware(), async (req, res) => {
  try {
    const { getMeeting } = require('./src/data');
    const meeting = await getMeeting(req.params.id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/meetings/:id', authMiddleware(), async (req, res) => {
  try {
    const { updateMeeting } = require('./src/data');
    const meeting = await updateMeeting(req.params.id, req.body);
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/meetings/:id/archive', authMiddleware(), async (req, res) => {
  try {
    const { archiveMeeting } = require('./src/data');
    const result = await archiveMeeting(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/meetings/:id', authMiddleware(), async (req, res) => {
  try {
    const { deleteMeeting } = require('./src/data');
    const result = await deleteMeeting(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === CASCADES ROUTES ===
app.get('/api/cascades', authMiddleware(), async (req, res) => {
  try {
    const { getAllCascades } = require('./src/data');
    const cascades = await getAllCascades(req.query);
    res.json(cascades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cascades', authMiddleware(), async (req, res) => {
  try {
    const { createCascade } = require('./src/data');
    const cascade = await createCascade(req.body);
    res.status(201).json(cascade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cascades/:id', authMiddleware(), async (req, res) => {
  try {
    const { getCascade } = require('./src/data');
    const cascade = await getCascade(req.params.id);
    if (!cascade) return res.status(404).json({ error: 'Cascade not found' });
    res.json(cascade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cascades/:id', authMiddleware(), async (req, res) => {
  try {
    const { updateCascade } = require('./src/data');
    const cascade = await updateCascade(req.params.id, req.body);
    res.json(cascade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cascades/:id/cascaded', authMiddleware(), async (req, res) => {
  try {
    const { markCascadeCascaded } = require('./src/data');
    const cascade = await markCascadeCascaded(req.params.id);
    res.json(cascade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cascades/:id/archive', authMiddleware(), async (req, res) => {
  try {
    const { archiveCascade } = require('./src/data');
    const result = await archiveCascade(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/cascades/:id/restore', authMiddleware(), async (req, res) => {
  try {
    const { restoreCascade } = require('./src/data');
    const cascade = await restoreCascade(req.params.id);
    res.json(cascade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cascades/:id', authMiddleware(), async (req, res) => {
  try {
    const { getDb } = require('./src/db');
    const db = getDb();
    db.run('DELETE FROM cascades WHERE id = ?', [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ deleted: this.changes });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === SLACK ALERTS ROUTES ===
app.get('/api/slack/alerts', authMiddleware(), async (req, res) => {
  try {
    const { getAllSlackAlerts } = require('./src/data');
    const alerts = await getAllSlackAlerts(req.query);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/slack/alerts/archived', authMiddleware(), async (req, res) => {
  try {
    const { getArchivedSlackAlerts } = require('./src/data');
    const alerts = await getArchivedSlackAlerts();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/slack/alerts', authMiddleware(), async (req, res) => {
  try {
    const { createSlackAlert } = require('./src/data');
    const alert = await createSlackAlert(req.body);
    res.status(201).json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/slack/alerts/:id', authMiddleware(), async (req, res) => {
  try {
    const { updateSlackAlert } = require('./src/data');
    const alert = await updateSlackAlert(req.params.id, req.body);
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/slack/alerts/:id/archive', authMiddleware(), async (req, res) => {
  try {
    const { archiveSlackAlert } = require('./src/data');
    const result = await archiveSlackAlert(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === NOTIFICATIONS ROUTES ===
app.get('/api/notifications', authMiddleware(), async (req, res) => {
  try {
    const { getAllNotifications } = require('./src/data');
    const notifications = await getAllNotifications();
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications/alerts', authMiddleware(), async (req, res) => {
  try {
    const { getUnacknowledgedAlerts } = require('./src/data');
    const alerts = await getUnacknowledgedAlerts();
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/acknowledge', authMiddleware(), async (req, res) => {
  try {
    const { getDb } = require('./src/db');
    const db = getDb();
    db.run(
      'UPDATE notification_history SET status = ? WHERE id = ?',
      ['acknowledged', req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ acknowledged: this.changes });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === SLACK OAUTH ROUTES ===
app.get('/api/slack/oauth/start', (req, res) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.SLACK_REDIRECT_URI || `${req.headers.host}/api/slack/oauth/callback`);
  const teamId = process.env.SLACK_TEAM_ID;
  const scope = 'channels:read,channels:history,chat:read,chat:write,users:read,reactions:read';
  const state = crypto.randomBytes(16).toString('hex');
  // Store state in a cookie or session
  res.redirect(
    `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scope}` +
    `&redirect_uri=${redirectUri}&state=${state}${teamId ? `&team=${teamId}` : ''}`
  );
});

app.get('/api/slack/oauth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    const axios = require('axios');
    const redirectUri = process.env.SLACK_REDIRECT_URI || `${req.headers.host}/api/slack/oauth/callback`;

    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.data.ok) {
      return res.status(400).send(`Slack OAuth error: ${response.data.error}`);
    }

    const { access_token, team, bot_user_id, scope } = response.data;

    // Store token in database
    const db = getDb();
    db.run(`
      INSERT INTO slack_tokens (access_token, team_id, team_name, bot_user_id, scope)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(team_id) DO UPDATE SET
        access_token = excluded.access_token,
        scope = excluded.scope,
        updated_at = CURRENT_TIMESTAMP
    `, [access_token, team.id, team.name, bot_user_id, scope]);

    // Fetch channels
    const channelsResponse = await axios.get('https://slack.com/api/conversations.list', {
      headers: { 'Authorization': `Bearer ${access_token}` },
      params: { types: 'public_channel', limit: 100 }
    });

    if (channelsResponse.data.ok) {
      const channels = channelsResponse.data.channels;
      for (const ch of channels) {
        db.run(
          'INSERT OR IGNORE INTO slack_channels (channel_id, channel_name) VALUES (?, ?)',
          [ch.id, ch.name]
        );
      }
      console.log(`Stored ${channels.length} Slack channels`);
    }

    res.send(`
      <!DOCTYPE html>
      <html><head><title>Slack OAuth Complete</title>
      <meta http-equiv="refresh" content="3;url=/dashboard.html#/settings"></head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
      <h2 style="color: #e75480;">Slack Connected Successfully!</h2>
      <p>Redirecting to dashboard...</p>
      </body></html>
    `);
  } catch (err) {
    console.error('Slack OAuth error:', err);
    res.status(500).send('OAuth callback failed');
  }
});

// Slack webhook endpoint for incoming messages
app.post('/api/slack/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['x-slack-signature'];
  const timestamp = req.headers['x-slack-request-timestamp'];

  // Verify Slack signing secret
  const crypto = require('crypto');
  const target = `v0:${timestamp}:${req.body.toString()}`;
  const expectedSignature = 'v0=' + crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
    .update(target, 'utf8')
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).send('Unauthorized');
  }

  const payload = JSON.parse(req.body.toString());

  // Handle event subscriptions
  if (payload.type === 'url_verification') {
    return res.status(200).send(payload.challenge);
  }

  // Handle message events
  if (payload.event && payload.event.type === 'message' && payload.event.channel) {
    const settings = await require('./src/data').getSettings();
    const rules = JSON.parse(settings.slack_alert_rules || '{}');
    const keywords = rules.keywords || ['urgent', 'asap', 'blocker'];

    const messageText = payload.event.text || '';
    const isUrgent = keywords.some(kw => messageText.toLowerCase().includes(kw));

    if (isUrgent) {
      const { createSlackAlert } = require('./src/data');
      const sender = payload.event.user || 'unknown';
      await createSlackAlert({
        message_preview: messageText.substring(0, 200),
        sender,
        channel: payload.event.channel,
        timestamp: payload.event.ts,
        slack_link: `https://slack.com/archives/${payload.event.channel}/p${payload.event.ts.replace('.', '')}`,
        urgency_reason: `Keyword matched: ${keywords.find(kw => messageText.toLowerCase().includes(kw))}`
      });
      console.log('Created Slack alert from webhook:', payload.event.ts);
    }
  }

  res.status(200).send('OK');
});

// === DATA EXPORT ===
app.get('/api/export', authMiddleware(), async (req, res) => {
  try {
    const db = getDb();
    const exportData = {};

    const tables = ['tasks', 'notes', 'meetings', 'cascades', 'slack_alerts',
                    'notification_history', 'push_subscriptions', 'settings'];

    for (const table of tables) {
      exportData[table] = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${table}`, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=dashboard-export.json');
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Catch-all for SPA routes ===
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/dashboard/*', (req, res) => {
  res.redirect('/dashboard.html');
});

app.get('/', (req, res) => {
  res.redirect('/dashboard.html');
});

// === Start Server ===
const startServer = async () => {
  await ensureAdminExists();

  const server = app.listen(PORT, () => {
    console.log(`Personal Dashboard running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT}/dashboard.html`);
  });

  // Start the background reminder scheduler
  startScheduler();

  // Cleanup expired push subscriptions hourly
  setInterval(() => {
    require('./src/notifications').cleanupExpiredSubscriptions();
  }, 60 * 60 * 1000);
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  const { stopScheduler } = require('./src/scheduler');
  stopScheduler();
  process.exit(0);
});
