const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Import modular components
const { initDatabase } = require('./database/dbManager');
const { handleConnection } = require('./websocket/connectionHandler');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const SERVER_IP = config.SERVER_IP || 'localhost';
const HTTP_PORT = config.HTTP_PORT || 3003;
const HTTPS_PORT = config.HTTPS_PORT || 3004;
const debug = config.debug || false;

// SSL configuration
const sslOptions = {
  cert: fs.readFileSync(path.join(__dirname, 'cert/cert1.pem')),
  key: fs.readFileSync(path.join(__dirname, 'cert/privkey1.pem')),
};

// Create servers
const httpServer = http.createServer();
const httpsServer = https.createServer(sslOptions);

// WebSocket servers
const wssInsecure = new WebSocket.Server({ server: httpServer });
const wssSecure = new WebSocket.Server({ server: httpsServer });

// Express app setup
const app = express();
const cors = require('cors');
app.use(cors());
httpServer.on('request', app);
httpsServer.on('request', app);

// Temporary URLs storage
const tempUrls = new Map();

// API Routes
app.get('/api/deezer/chart', async (req, res) => {
  try {
    const response = await fetch('https://api.deezer.com/chart');
    
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }
    
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('❌ Deezer proxy error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Deezer API' });
  }
});

app.get('/api/deezer/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query parameter "q"' });
  }

  try {
    const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`);

    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('❌ Deezer search proxy error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Deezer search results' });
  }
});

// Stream endpoint
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

  if(debug)
    console.log(`🎵 Streaming song from temporary URL: ${songPath}`);
  res.setHeader('Content-Type', 'audio/mpeg');
  const stream = fs.createReadStream(songPath);

  stream.pipe(res);

  stream.on('end', () => {
    if(debug)
      console.log(`🎵 Finished streaming song: ${songPath}`);
    tempUrls.delete(id);
  });

  stream.on('error', (err) => {
    console.error('❌ Error streaming song:', err.message);
    res.status(500).send('❌ Error streaming song');
  });
});

// WebSocket connection handlers
wssInsecure.on('connection', (ws, req) => handleConnection(ws, req, tempUrls, debug));
wssSecure.on('connection', (ws, req) => handleConnection(ws, req, tempUrls, debug));

// Initialize and start servers
initDatabase().then(() => {
  httpServer.listen(HTTP_PORT, () => {
    console.log(`🌐 WS server running at http://${SERVER_IP}:${HTTP_PORT}`);
  });

  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`🔒 WSS server running at https://${SERVER_IP}:${HTTPS_PORT}`);
  });
});

