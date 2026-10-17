const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDb } = require('./db');

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const TOKEN_EXPIRY = '7d';

// Simple hash-based password (PBKDF2 with salt)
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(32).toString('hex');
}

function createUser(username, password, email = null) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);

    db.run(
      'INSERT INTO users (username, password_hash, salt, email) VALUES (?, ?, ?, ?)',
      [username, passwordHash, salt, email],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastId, username, email });
      }
    );
  });
}

function verifyUser(username, password) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.get(
      'SELECT id, username, password_hash, salt, email FROM users WHERE username = ?',
      [username],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve(null);

        const passwordHash = hashPassword(password, row.salt);
        if (passwordHash === row.password_hash) {
          resolve({ id: row.id, username: row.username, email: row.email });
        } else {
          resolve(null);
        }
      }
    );
  });
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    SESSION_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SESSION_SECRET);
  } catch (err) {
    return null;
  }
}

function middleware() {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    req.user = decoded;
    next();
  };
}

function ensureAdminExists() {
  return new Promise((resolve, reject) => {
    const db = getDb();
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
      if (err) return reject(err);
      if (row.count === 0) {
        const adminPassword = process.env.ADMIN_PASSWORD || 'changeme';
        const salt = generateSalt();
        const passwordHash = hashPassword(adminPassword, salt);
        db.run(
          'INSERT INTO users (username, password_hash, salt, email) VALUES (?, ?, ?, ?)',
          ['admin', passwordHash, salt, 'admin@dashboard.local'],
          function (err) {
            if (err) return reject(err);
            console.log('Admin user created. Username: admin, Password:', adminPassword);
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  hashPassword,
  generateSalt,
  createUser,
  verifyUser,
  generateToken,
  verifyToken,
  middleware,
  ensureAdminExists
};
