const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const { YtDlp } = require('ytdlp-nodejs');

const ytdlp = new YtDlp();
const sanitize = require('sanitize-filename');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cheerio = require('cheerio');

// Load configuration from config.json
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const SERVER_IP = config.SERVER_IP || 'localhost';
const HTTP_PORT = config.HTTP_PORT || 3003;
const HTTPS_PORT = config.HTTPS_PORT || 3004;

// Load HTTPS credentials
const sslOptions = {
  cert: fs.readFileSync(path.join(__dirname, 'cert/cert1.pem')),
  key: fs.readFileSync(path.join(__dirname, 'cert/privkey1.pem')),
};

const httpServer = http.createServer();
const httpsServer = https.createServer(sslOptions);

const wssInsecure = new WebSocket.Server({ server: httpServer });
const wssSecure = new WebSocket.Server({ server: httpsServer });

const app = express();
httpServer.on('request', app);
httpsServer.on('request', app);

// Temporary URL store
const tempUrls = new Map();

app.get('/stream/:id', (req, res) => {
  const { id } = req.params;

  if (!tempUrls.has(id)) {
    return res.status(404).send('❌ Invalid or expired URL');
  }

  const { songPath, expiresAt } = tempUrls.get(id);

  if (Date.now() > expiresAt) {
    tempUrls.delete(id);
    return res.status(410).send('❌ URL has expired');
  }

  console.log(`🎵 Streaming song from temporary URL: ${songPath}`);
  res.setHeader('Content-Type', 'audio/mpeg');
  const stream = fs.createReadStream(songPath);

  stream.pipe(res);

  stream.on('end', () => {
    console.log(`🎵 Finished streaming song: ${songPath}`);
    tempUrls.delete(id);
  });

  stream.on('error', (err) => {
    console.error('❌ Error streaming song:', err.message);
    res.status(500).send('❌ Error streaming song');
  });
});

// Load database config
const dbConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'db-config.json'), 'utf8'));
const clients = new Map();

function generateSessionKey() {
  return crypto.randomBytes(32);
}

let db;

async function createUsersTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      username ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL UNIQUE,
      password ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL
    );
  `;

  try {
    if (dbConfig.type === 'mysql') {
      await db.execute(sql);
      console.log('✅ Users table is ready in MySQL.');
    } else {
      db.serialize(() => {
        db.run(sql, (err) => {
          if (err) console.error('❌ Failed to create users table in SQLite:', err.message);
          else console.log('✅ Users table is ready in SQLite.');
        });
      });
    }
  } catch (err) {
    console.error('❌ Failed to create users table:', err.message);
  }
}

async function initDatabase() {
  try {
    if (dbConfig.type === 'mysql') {
      db = mysql.createPool({
        host: dbConfig.mysql.host,
        user: dbConfig.mysql.user,
        password: dbConfig.mysql.password,
        database: dbConfig.mysql.database,
      });
    } else {
      const sqliteFile = path.join(__dirname, dbConfig.sqlite.file);
      if (!fs.existsSync(sqliteFile)) fs.writeFileSync(sqliteFile, '');
      db = new sqlite3.Database(sqliteFile, (err) => {
        if (err) console.error('❌ SQLite connection error:', err.message);
        else console.log('✅ Connected to SQLite database.');
      });
    }
    await createUsersTable();
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
  }
}

function encryptMessage(message, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('base64'), data: encrypted.toString('base64') });
}

function decryptMessage(encrypted, key) {
  try {
    const data = JSON.parse(encrypted);
    const iv = Buffer.from(data.iv, 'base64');
    const encryptedText = Buffer.from(data.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('❌ Decryption error:', err.message);
    return null;
  }
}

async function validateLogin(username, password) {
  try {
    if (dbConfig.type === 'mysql') {
      const [rows] = await db.execute('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
      return rows.length > 0;
    } else {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
          if (err) return reject(err);
          resolve(!!row);
        });
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

  ws.send(JSON.stringify({ type: 'session-key', key: sessionKey.toString('base64') }));

  ws.on('message', async (data) => {
    const key = clients.get(ws);
    const decrypted = decryptMessage(data, key);

    if (!decrypted) return;

    try {
      const message = JSON.parse(decrypted);

      switch (message.action) {
        case 'login': {
          const { username, password } = message;

          if (!username || !password) {
            ws.send(encryptMessage(JSON.stringify({ success: false, error: 'Missing username or password' }), key));
            return;
          }

          const isValid = await validateLogin(username, password);
          ws.send(
            encryptMessage(
              JSON.stringify({ success: isValid, message: isValid ? 'Login successful' : 'Invalid credentials', username }),
              key
            )
          );
          break;
        }
        case 'heartbeat':
          break;
        case 'stream-song': {
          const { title, artist } = message;

          if (!title || !artist) {
            ws.send(
              encryptMessage(
                JSON.stringify({
                  action: 'stream-song',
                  type: 'error',
                  success: false,
                  error: 'Missing title or artist',
                }),
                key
              )
            );
            return;
          }

          const songPath = path.join(__dirname, 'songs', `${title} - ${artist}.mp3`);

          // Check if the song exists
          if (!fs.existsSync(songPath)) {
            console.warn(`⚠️ Song not found locally, attempting to download: ${title} - ${artist}`);
            try {
              await downloadSong(title, artist, path.join(__dirname, 'songs'));
            } catch (err) {
              console.error('❌ Failed to download song:', err.message);
              ws.send(encryptMessage(JSON.stringify({
                action: 'stream-song',
                type: 'error',
                success: false,
                error: 'Failed to download song.',
              }), key));
              return;
            }

            // ws.send(
            //   encryptMessage(
            //     JSON.stringify({
            //       action: 'stream-song',
            //       type: 'error',
            //       success: false,
            //       error: 'Song not found',
            //     }),
            //     key
            //   )
            // );
            // return;
          }

          // Generate a unique temporary URL
          const tempId = uuidv4();
          const tempUrl = `/stream/${tempId}.mp3`; // Add .mp3 to the end of the URL
          tempUrls.set(`${tempId}.mp3`, { songPath, expiresAt: Date.now() + 240000 }); // Expires in 4 minutes

          // Send the temporary URL to the client
          ws.send(
            encryptMessage(
              JSON.stringify({
                action: 'stream-song',
                type: 'url',
                success: true,
                url: `http://URLPATH${tempUrl}`, // Replace with your server's URL
              }),
              key
            )
          );

          console.log(`🎵 Temporary URL created for ${title} - ${artist}: ${tempUrl}`);
          break;
        }
        default:
          ws.send(encryptMessage(JSON.stringify({ success: false, error: 'Unknown action' }), key));
          break;
      }
    } catch (err) {
      console.error('❌ Message processing error:', err.message);
      ws.send(encryptMessage(JSON.stringify({ success: false, error: 'Invalid message format' }), key));
    }
  });

  ws.on('close', () => {
    console.log('❌ Client disconnected');
    clients.delete(ws);
  });
}

wssInsecure.on('connection', (ws, req) => handleConnection(ws, req));
wssSecure.on('connection', (ws, req) => handleConnection(ws, req));

initDatabase().then(() => {
  httpServer.listen(HTTP_PORT, () => {
    console.log(`🌐 WS server running at http://${SERVER_IP}:${HTTP_PORT}`);
  });

  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`🔒 WSS server running at https://${SERVER_IP}:${HTTPS_PORT}`);
  });
});

async function getFirstYouTubeVideoUrl(query) {
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const res = await fetch(searchUrl);
  const html = await res.text();
  const $ = cheerio.load(html);
  const videoId = html.match(/"videoId":"(.*?)"/)?.[1];
  console.log(`🔍 YouTube search URL: ${searchUrl}`);
  console.log(`🔍 YouTube video ID: ${videoId}`);
  console.log(`🔍 YouTube video URL: https://www.youtube.com/watch?v=${videoId}`);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

async function downloadSong(title, artist, outputDir) {
  const safeName = sanitize(`${title} - ${artist}`);
  const filePath = path.join(outputDir, `${safeName}.mp3`);

  if (fs.existsSync(filePath)) return filePath;

  const searchQuery = `${title} ${artist}`;
  const videoUrl = await getFirstYouTubeVideoUrl(searchQuery);

  if (!videoUrl) throw new Error('No video found for search query');

  // const stream = await ytdlp.exec({
  //   url: videoUrl,
  //   output: filePath,
  //   arguments: ['-x', '--audio-format', 'mp3'],
  // });

  const output = await ytdlp.downloadAsync(videoUrl, {
    output: filePath,
    format: 'bestaudio/best',
  });

  console.log(`🎵 Downloaded song: ${filePath}`);

  return filePath;
}

