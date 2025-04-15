const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();

// Load HTTPS credentials
const sslOptions = {
  cert: fs.readFileSync(path.join(__dirname, 'cert/cert1.pem')),
  key: fs.readFileSync(path.join(__dirname, 'cert/privkey1.pem')),
};

// Create HTTP and HTTPS servers
const httpServer = http.createServer();
const httpsServer = https.createServer(sslOptions);

// Create WebSocket servers
const wssInsecure = new WebSocket.Server({ server: httpServer });
const wssSecure = new WebSocket.Server({ server: httpsServer });

// Load database configuration
const dbConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'db-config.json'), 'utf8'));

// Client session key tracking
const clients = new Map();

// Generate a unique AES key per client
function generateSessionKey() {
  return crypto.randomBytes(32); // AES-256
}

// Database connection initialization
let db;

async function createUsersTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS users (
      username ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL UNIQUE,
      password ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL
    );
  `;

  if (dbConfig.type === 'mysql') {
    try {
      await db.execute(createTableSQL);
      console.log('✅ Users table is ready in MySQL.');
    } catch (err) {
      console.error('❌ Failed to create users table in MySQL:', err.message);
    }
  } else if (dbConfig.type === 'sqlite') {
    db.serialize(() => {
      db.run(createTableSQL, (err) => {
        if (err) {
          console.error('❌ Failed to create users table in SQLite:', err.message);
        } else {
          console.log('✅ Users table is ready in SQLite.');
        }
      });
    });
  }
}

async function initDatabase() {
  if (dbConfig.type === 'mysql') {
    db = mysql.createPool({
      host: dbConfig.mysql.host,
      user: dbConfig.mysql.user,
      password: dbConfig.mysql.password,
      database: dbConfig.mysql.database,
    });
  } else if (dbConfig.type === 'sqlite') {
    const sqliteFilePath = path.join(__dirname, dbConfig.sqlite.file);

    if (!fs.existsSync(sqliteFilePath)) {
      console.log('📂 SQLite database file not found. Creating a new one...');
      fs.writeFileSync(sqliteFilePath, '');
    }

    db = new sqlite3.Database(sqliteFilePath, (err) => {
      if (err) {
        console.error('❌ Failed to connect to SQLite database:', err.message);
      } else {
        console.log('✅ Connected to SQLite database.');
      }
    });
  } else {
    throw new Error('Unsupported database type in db-config.json');
  }

  await createUsersTable();
}

function encryptMessage(message, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(message, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted,
  });
}

function decryptMessage(encrypted, key) {
  try {
    const data = JSON.parse(encrypted);
    const iv = Buffer.from(data.iv, 'base64');
    const encryptedText = Buffer.from(data.data, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, null, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('❌ Decryption error:', err.message);
    return null;
  }
}

async function validateLogin(username, password) {
  try {
    if (dbConfig.type === 'mysql') {
      const [rows] = await db.execute(
        'SELECT * FROM users WHERE username = ? AND password = ?',
        [username, password]
      );
      return rows.length > 0;
    } else if (dbConfig.type === 'sqlite') {
      return new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM users WHERE username = ? AND password = ?',
          [username, password],
          (err, row) => {
            if (err) return reject(err);
            resolve(!!row);
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Database error:', err.message);
    return false;
  }
}

function handleConnection(ws, req) {
  const sessionKey = generateSessionKey();
  clients.set(ws, sessionKey);

  console.log(`🔗 New ${req.socket.encrypted ? 'WSS' : 'WS'} client connected`);

  ws.send(
    JSON.stringify({
      type: 'session-key',
      key: sessionKey.toString('base64'),
    })
  );

  ws.on('message', async (data) => {
    const key = clients.get(ws);
    const decrypted = decryptMessage(data, key);

    if (!decrypted) {
      console.warn('⚠️ Failed to decrypt client message.');
      return;
    }

    try {
      const message = JSON.parse(decrypted);

      if (message.action === 'login') {
        const { username, password } = message;

        if (!username || !password) {
          ws.send(
            encryptMessage(
              JSON.stringify({ success: false, error: 'Missing username or password' }),
              key
            )
          );
          return;
        }

        const isValid = await validateLogin(username, password);

        ws.send(
          encryptMessage(
            JSON.stringify({
              success: isValid,
              message: isValid ? 'Login successful' : 'Invalid credentials',
              username: username,
            }),
            key
          )
        );
      } else if (message.action === 'heartbeat') {
          return;
      } else {
        ws.send(
          encryptMessage(
            JSON.stringify({ success: false, error: 'Unknown action' }),
            key
          )
        );
      }
    } catch (err) {
      console.error('❌ Error processing message:', err.message);
      ws.send(
        encryptMessage(
          JSON.stringify({ success: false, error: 'Invalid message format' }),
          key
        )
      );
    }
  });

  ws.on('close', () => {
    console.log('❌ Client disconnected');
    clients.delete(ws);
  });
}

// Attach connection handler
wssInsecure.on('connection', (ws, req) => handleConnection(ws, req));
wssSecure.on('connection', (ws, req) => handleConnection(ws, req));

// Start everything
initDatabase().then(() => {
  httpServer.listen(3003, () => {
    console.log('🌐 WS server running at ws://localhost:3003');
  });

  httpsServer.listen(3004, () => {
    console.log('🔒 WSS server running at wss://localhost:3004');
  });
});
