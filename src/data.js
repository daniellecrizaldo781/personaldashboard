const { getDb } = require('./db');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    due_date: row.due_date,
    reminder_time: row.reminder_time,
    category: row.category,
    status: row.status,
    checklist: row.checklist ? JSON.parse(row.checklist) : [],
    notes: row.notes,
    recurring: row.recurring,
    parent_task_id: row.parent_task_id,
    related_note_id: row.related_note_id,
    related_meeting_id: row.related_meeting_id,
    related_cascade_id: row.related_cascade_id,
    slack_message_ts: row.slack_message_ts,
    slack_channel: row.slack_channel,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    archived: !!row.archived,
    snoozed_until: row.snoozed_until,
    reminder_count: row.reminder_count,
    last_reminded: row.last_reminded
  };
}

// ===== NOTES =====
async function createNote(data) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notes (title, content, category, tags, pinned, important, task_id, project, meeting_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title, data.content || null, data.category || null,
        JSON.stringify(data.tags || []),
        data.pinned ? 1 : 0, data.important ? 1 : 0,
        data.task_id || null, data.project || null, data.meeting_id || null
      ],
      function (err) {
        if (err) return reject(err);
        resolve(getNote(this.lastID));
      }
    );
  });
}

async function getNote(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve({
        ...row,
        tags: row.tags ? JSON.parse(row.tags) : [],
        pinned: !!row.pinned,
        important: !!row.important
      });
    });
  });
}

async function getAllNotes(filters = {}) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM notes WHERE archived = 0`;
    const params = [];
    if (filters.pinned) {
      query += ` AND pinned = 1`;
    }
    if (filters.important) {
      query += ` AND important = 1`;
    }
    if (filters.search) {
      query += ` AND (title LIKE ? OR content LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s);
    }
    if (filters.archived) {
      query = `SELECT * FROM notes WHERE archived = 1`;
    }
    query += ` ORDER BY pinned DESC, important DESC, created_at DESC`;
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(r => ({
        ...r,
        tags: r.tags ? JSON.parse(r.tags) : [],
        pinned: !!r.pinned,
        important: !!r.important
      })));
    });
  });
}

async function updateNote(id, data) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const updates = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'tags') {
        updates.push('tags = ?');
        params.push(JSON.stringify(value));
      } else if (key === 'pinned' || key === 'important' || key === 'archived') {
        updates.push(`${key} = ?`);
        params.push(value ? 1 : 0);
      } else {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    }
    if (!updates.length) return resolve(getNote(id));
    db.run(
      `UPDATE notes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...params, id],
      function (err) {
        if (err) return reject(err);
        resolve(getNote(id));
      }
    );
  });
}

async function archiveNote(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run('UPDATE notes SET archived = 1 WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve({ archived: this.changes });
    });
  });
}

async function deleteNote(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM notes WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve({ deleted: this.changes });
    });
  });
}

// ===== MEETINGS =====
async function createMeeting(data) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO meetings (title, date_time, attendees, agenda, discussion_notes, decisions, action_items, assigned_to, follow_up_date, project)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title, data.date_time || null, data.attendees || null,
        data.agenda || null, data.discussion_notes || null,
        data.decisions || JSON.stringify(data.decisionList || []),
        JSON.stringify(data.action_items || []),
        data.assigned_to || null, data.follow_up_date || null,
        data.project || null
      ],
      function (err) {
        if (err) return reject(err);
        resolve(getMeeting(this.lastID));
      }
    );
  });
}

async function getMeeting(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM meetings WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve({
        ...row,
        action_items: row.action_items ? JSON.parse(row.action_items) : []
      });
    });
  });
}

async function getAllMeetings(filters = {}) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM meetings WHERE 1=1`;
    const params = [];
    if (filters.upcoming) {
      const now = new Date().toISOString();
      query += ` AND date_time >= ? AND completed = 0`;
      params.push(now);
    }
    if (filters.follow_up) {
      const now = new Date().toISOString();
      query += ` AND follow_up_date IS NOT NULL AND follow_up_date <= ? AND completed = 0`;
      params.push(now);
    }
    if (filters.search) {
      query += ` AND (title LIKE ? OR agenda LIKE ? OR discussion_notes LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }
    query += ` ORDER BY date_time ASC`;
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(r => ({
        ...r,
        action_items: r.action_items ? JSON.parse(r.action_items) : []
      })));
    });
  });
}

async function updateMeeting(id, data) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const updates = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'action_items' || key === 'decisions') {
        updates.push(`${key} = ?`);
        params.push(JSON.stringify(value));
      } else {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    }
    if (!updates.length) return resolve(getMeeting(id));
    db.run(
      `UPDATE meetings SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...params, id],
      function (err) {
        if (err) return reject(err);
        resolve(getMeeting(id));
      }
    );
  });
}

async function archiveMeeting(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run('UPDATE meetings SET completed = 1 WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve({ archived: this.changes });
    });
  });
}

async function deleteMeeting(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM meetings WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve({ deleted: this.changes });
    });
  });
}

// ===== CASCades =====
async function createCascade(data) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO cascades (title, details, brand, department, project, priority, date_received, deadline, status, slack_link, meeting_note_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title, data.details || null, data.brand || null,
        data.department || null, data.project || null,
        data.priority || 'Normal', data.date_received || new Date().toISOString(),
        data.deadline || null, data.status || 'To Cascade',
        data.slack_link || null, data.meeting_note_id || null
      ],
      function (err) {
        if (err) return reject(err);
        resolve(getCascade(this.lastID));
      }
    );
  });
}

async function getCascade(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM cascades WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve({ ...row, archived: !!row.archived });
    });
  });
}

async function getAllCascades(filters = {}) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM cascades WHERE archived = 0`;
    const params = [];
    if (filters.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters.overdue) {
      const now = new Date().toISOString();
      query += ` AND deadline < ? AND status != 'Cascaded'`;
      params.push(now);
    }
    if (filters.search) {
      query += ` AND (title LIKE ? OR details LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s);
    }
    query += ` ORDER BY
      CASE priority WHEN 'Urgent' THEN 1 WHEN 'High' THEN 2 ELSE 3 END,
      deadline ASC, created_at DESC`;
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(r => ({ ...r, archived: !!r.archived })));
    });
  });
}

async function updateCascade(id, data) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const updates = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      updates.push(`${key} = ?`);
      params.push(value);
    }
    if (!updates.length) return resolve(getCascade(id));
    db.run(
      `UPDATE cascades SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...params, id],
      function (err) {
        if (err) return reject(err);
        resolve(getCascade(id));
      }
    );
  });
}

async function markCascadeCascaded(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE cascades SET status = 'Cascaded', date_cascaded = ?, archived = 1 WHERE id = ?`,
      [now, id],
      function (err) {
        if (err) return reject(err);
        resolve(getCascade(id));
      }
    );
  });
}

async function archiveCascade(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run('UPDATE cascades SET archived = 1 WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve({ archived: this.changes });
    });
  });
}

async function restoreCascade(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE cascades SET archived = 0, status = 'To Cascade', date_cascaded = NULL WHERE id = ?`,
      [id],
      function (err) {
        if (err) return reject(err);
        resolve(getCascade(id));
      }
    );
  });
}

async function getCascadesNeedingReminders() {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.all(
      `SELECT * FROM cascades WHERE status != 'Cascaded' AND archived = 0
       AND deadline IS NOT NULL AND deadline <= ?
       AND (last_reminded IS NULL OR last_reminded < ?)`,
      [now, new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map(r => ({ ...r, archived: !!r.archived })));
      }
    );
  });
}

// ===== SLACK ALERTS =====
async function createSlackAlert(data) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO slack_alerts (message_preview, sender, channel, timestamp, slack_link, urgency_reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.message_preview, data.sender, data.channel,
        data.timestamp, data.slack_link, data.urgency_reason
      ],
      function (err) {
        if (err) return reject(err);
        resolve(getSlackAlert(this.lastID));
      }
    );
  });
}

async function getSlackAlert(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM slack_alerts WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve({ ...row, archived: !!row.archived });
    });
  });
}

async function getAllSlackAlerts(filters = {}) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM slack_alerts WHERE archived = 0`;
    const params = [];
    if (filters.review_status) {
      query += ` AND review_status = ?`;
      params.push(filters.review_status);
    }
    if (filters.search) {
      query += ` AND (message_preview LIKE ? OR sender LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s);
    }
    query += ` ORDER BY created_at DESC`;
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(r => ({ ...r, archived: !!r.archived })));
    });
  });
}

async function updateSlackAlert(id, data) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const updates = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
      updates.push(`${key} = ?`);
      params.push(value);
    }
    if (!updates.length) return resolve(getSlackAlert(id));
    db.run(
      `UPDATE slack_alerts SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...params, id],
      function (err) {
        if (err) return reject(err);
        resolve(getSlackAlert(id));
      }
    );
  });
}

async function archiveSlackAlert(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run('UPDATE slack_alerts SET archived = 1 WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve({ archived: this.changes });
    });
  });
}

async function getArchivedSlackAlerts() {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM slack_alerts WHERE archived = 1 ORDER BY created_at DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map(r => ({ ...r, archived: !!r.archived })));
      }
    );
  });
}

// ===== SETTINGS =====
async function getSettings() {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(`SELECT key, value FROM settings`, [], (err, rows) => {
      if (err) return reject(err);
      const settings = {};
      for (const row of rows) {
        try {
          settings[row.key] = JSON.parse(row.value);
        } catch (e) {
          settings[row.key] = row.value;
        }
      }
      resolve(settings);
    });
  });
}

async function updateSetting(key, value) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const serialized = typeof value === 'string' && value.trim().startsWith('{')
      ? value
      : JSON.stringify(value);
    // If it's already a JSON string, use as-is; otherwise stringify
    const finalValue = typeof value === 'string' ? value : serialized;
    db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, finalValue],
      function (err) {
        if (err) return reject(err);
        resolve({ key, value });
      }
    );
  });
}

// ===== PUSH SUBSCRIPTIONS =====
async function saveSubscription(subscription) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const keys = subscription.keys ? JSON.stringify(subscription.keys) : null;
    db.run(
      `INSERT INTO push_subscriptions (endpoint, keys) VALUES (?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET last_used = CURRENT_TIMESTAMP`,
      [subscription.endpoint, keys],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

async function getAllSubscriptions() {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, endpoint, keys, created_at, last_used FROM push_subscriptions`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function removeSubscription(endpoint) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [endpoint], function (err) {
      if (err) return reject(err);
      resolve({ removed: this.changes });
    });
  });
}

// ===== NOTIFICATION HISTORY =====
async function logNotification(data) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notification_history (source, source_id, title, body, priority, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.source, data.source_id, data.title, data.body,
        data.priority || 'Normal', data.status || 'pending'
      ],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

async function getAllNotifications() {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM notification_history ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function markNotificationDelivered(id, status = 'sent') {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE notification_history SET delivered = 1, delivery_status = ?, delivered_at = ? WHERE id = ?`,
      [status, now, id],
      function (err) {
        if (err) return reject(err);
        resolve({ updated: this.changes });
      }
    );
  });
}

async function getUnacknowledgedAlerts() {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM notification_history WHERE status = 'pending' ORDER BY created_at DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

module.exports = {
  createNote, getNote, getAllNotes, updateNote, archiveNote, deleteNote,
  createMeeting, getMeeting, getAllMeetings, updateMeeting, archiveMeeting, deleteMeeting,
  createCascade, getCascade, getAllCascades, updateCascade, markCascadeCascaded,
  archiveCascade, restoreCascade, getCascadesNeedingReminders,
  createSlackAlert, getSlackAlert, getAllSlackAlerts, updateSlackAlert,
  archiveSlackAlert, getArchivedSlackAlerts,
  getSettings, updateSetting,
  saveSubscription, getAllSubscriptions, removeSubscription,
  logNotification, getAllNotifications, markNotificationDelivered,
  getUnacknowledgedAlerts
};
