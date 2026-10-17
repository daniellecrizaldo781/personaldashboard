const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'dashboard.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function initDatabase() {
  if (db) return db;

  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Failed to open database:', err.message);
    } else {
      console.log('Connected to SQLite database:', DB_PATH);
    }
  });

  db.serialize(() => {
    // Users table for authentication
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Settings table for notification preferences
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Push subscriptions table
    db.run(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT UNIQUE NOT NULL,
        keys TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notification history table
    db.run(`
      CREATE TABLE IF NOT EXISTS notification_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        source_id TEXT,
        title TEXT NOT NULL,
        body TEXT,
        priority TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered BOOLEAN DEFAULT 0,
        delivery_status TEXT,
        delivered_at DATETIME
      )
    `);

    // Tasks table
    db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'Normal',
        due_date DATETIME,
        reminder_time DATETIME,
        category TEXT,
        status TEXT DEFAULT 'Pending',
        checklist TEXT,
        notes TEXT,
        recurring TEXT,
        parent_task_id INTEGER,
        related_note_id INTEGER,
        related_meeting_id INTEGER,
        related_cascade_id INTEGER,
        slack_message_ts TEXT,
        slack_channel TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        archived BOOLEAN DEFAULT 0,
        snoozed_until DATETIME,
        reminder_count INTEGER DEFAULT 0,
        last_reminded DATETIME
      )
    `);

    // Important notes table
    db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT,
        category TEXT,
        tags TEXT,
        pinned BOOLEAN DEFAULT 0,
        important BOOLEAN DEFAULT 0,
        task_id INTEGER,
        project TEXT,
        meeting_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived BOOLEAN DEFAULT 0
      )
    `);

    // Meeting notes table
    db.run(`
      CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date_time DATETIME,
        attendees TEXT,
        agenda TEXT,
        discussion_notes TEXT,
        decisions TEXT,
        action_items TEXT,
        assigned_to TEXT,
        follow_up_date DATETIME,
        project TEXT,
        completed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Team cascades table
    db.run(`
      CREATE TABLE IF NOT EXISTS cascades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        details TEXT,
        brand TEXT,
        department TEXT,
        project TEXT,
        priority TEXT DEFAULT 'Normal',
        date_received DATETIME,
        deadline DATETIME,
        status TEXT DEFAULT 'To Cascade',
        date_cascaded DATETIME,
        follow_up_notes TEXT,
        slack_link TEXT,
        meeting_note_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        archived BOOLEAN DEFAULT 0,
        last_reminded DATETIME
      )
    `);

    // Slack alerts table
    db.run(`
      CREATE TABLE IF NOT EXISTS slack_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_preview TEXT,
        sender TEXT,
        channel TEXT,
        timestamp TEXT,
        slack_link TEXT,
        urgency_reason TEXT,
        review_status TEXT DEFAULT 'unreviewed',
        converted_task_id INTEGER,
        converted_cascade_id TEXT,
        archived BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Slack auth tokens table
    db.run(`
      CREATE TABLE IF NOT EXISTS slack_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        access_token TEXT,
        team_id TEXT,
        team_name TEXT,
        bot_user_id TEXT,
        scope TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Slack channel subscriptions table
    db.run(`
      CREATE TABLE IF NOT EXISTS slack_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        watched BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id)
      )
    `);

    // Task history table for audit trail
    db.run(`
      CREATE TABLE IF NOT EXISTS task_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        old_values TEXT,
        new_values TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default settings
    const defaultSettings = [
      ['full_window_alerts', 'true'],
      ['desktop_notifications', 'true'],
      ['phone_push_notifications', 'false'],
      ['notify_priorities', '["Urgent","High"]'],
      ['slack_alert_rules', '{"keywords":["urgent","asap","blocker"],"reactions":["rotating_light","eyes"],"channels":[]}'],
      ['cascade_reminder_rules', '{"reminder_before_hours":["24","2"]}'],
      ['reminder_frequency', 'daily'],
      ['snooze_durations', '["15 min","30 min","1 hour","2 hours","4 hours","1 day"]'],
      ['quiet_hours_start', ''],
      ['quiet_hours_end', ''],
      ['timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'],
      ['sound_enabled', 'true'],
      ['critical_alert_override', 'false']
    ];

    defaultSettings.forEach(([key, value]) => {
      db.run(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        [key, value]
      );
    });
  });

  return db;
}

function getDb() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

module.exports = {
  initDatabase,
  getDb,
  DB_PATH
};
