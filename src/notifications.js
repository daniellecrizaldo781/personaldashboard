const webpush = require('web-push');
const { getDb } = require('./db');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:danielle@daniellecrizaldo.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('Web Push VAPID keys not configured. Phone push notifications will not work.');
}

async function sendPushNotification(subscription, payload) {
  const notification = {
    title: payload.title,
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: payload.url || '/',
    data: payload.data || {},
    priority: payload.priority || 'Normal',
    tag: payload.tag || 'dashboard-notification',
    timestamp: Date.now()
  };

  try {
    const result = await webpush.sendNotification(subscription, JSON.stringify(notification), {
      TTL: 24 * 60 * 60, // 24 hours
      vapidDetails: {
        publicKey: VAPID_PUBLIC_KEY,
        privateKey: VAPID_PRIVATE_KEY,
        subject: VAPID_SUBJECT
      }
    });
    return { success: true, result };
  } catch (err) {
    console.error('Push notification error:', err.message);
    return { success: false, error: err.message, statusCode: err.statusCode };
  }
}

async function sendToAllSubscribers(payload) {
  const db = getDb();
  return new Promise((resolve) => {
    db.all(`SELECT id, endpoint, keys FROM push_subscriptions`, [], async (err, rows) => {
      if (err) return resolve([]);
      const results = [];
      for (const row of rows) {
        try {
          const subscription = {
            endpoint: row.endpoint,
            keys: row.keys ? JSON.parse(row.keys) : {}
          };
          const result = await sendPushNotification(subscription, payload);
          results.push({ endpoint: row.endpoint, ...result });
        } catch (e) {
          results.push({ endpoint: row.endpoint, success: false, error: e.message });
        }
      }
      resolve(results);
    });
  });
}

async function cleanupExpiredSubscriptions() {
  const db = getDb();
  return new Promise((resolve) => {
    db.all(`SELECT id, endpoint FROM push_subscriptions`, [], async (err, rows) => {
      if (err) return resolve([]);
      const removed = [];
      for (const row of rows) {
        try {
          const subscription = {
            endpoint: row.endpoint,
            keys: {}
          };
          // Send a test ping to check subscription validity
          await webpush.sendNotification(
            subscription,
            JSON.stringify({ type: 'ping', timestamp: Date.now() }),
            { TTL: 0 }
          );
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 403) {
            db.run(`DELETE FROM push_subscriptions WHERE endpoint = ?`, [row.endpoint]);
            removed.push(row.endpoint);
          }
        }
      }
      if (removed.length > 0) {
        console.log(`Cleaned up ${removed.length} expired subscriptions`);
      }
      resolve(removed);
    });
  });
}

async function sendSystemNotification(subscription, title, body, options = {}) {
  return sendPushNotification(subscription, {
    title,
    body,
    priority: options.priority || 'Normal',
    tag: options.tag,
    url: options.url || '/',
    data: options.data || {}
  });
}

module.exports = {
  sendPushNotification,
  sendToAllSubscribers,
  cleanupExpiredSubscriptions,
  sendSystemNotification,
  VAPID_PUBLIC_KEY
};
