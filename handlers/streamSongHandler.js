const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sanitize = require('sanitize-filename');
const { downloadSong } = require('../services/downloadService');
const { encryptMessage } = require('../utils/crypto');

async function handleStreamSong(message, ws, key, tempUrls, debug) {
  const { title, artist, image } = message;

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

  const safeName = sanitize(`${title} - ${artist}`);
  const songPath = path.join(__dirname, '..', 'songs', `${safeName}.mp3`);
  const mm = await import('music-metadata');
  const { getAudioDurationInSeconds } = await import('get-audio-duration');
  let duration;
    
  if (!fs.existsSync(songPath)) {
    console.warn(`⚠️ Song not found locally, attempting to download: ${title} - ${artist}`);
    try {
      await downloadSong(title, artist, path.join(__dirname, '..', 'songs'));
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
  }

  try {
    const metadata = await mm.parseFile(songPath);
    duration = metadata.format.duration;

    if (!duration) {
      // Fallback to raw duration calculation
      duration = await getAudioDurationInSeconds(songPath) * 1000;
    }
  } catch (err) {
    console.error('❌ Failed to parse metadata or duration:', err.message);
    ws.send(encryptMessage(JSON.stringify({
      action: 'stream-song',
      type: 'error',
      success: false,
      error: 'Unable to read song metadata.',
    }), key));
    return;
  }

  const tempId = uuidv4();
  const tempUrl = `/stream/${tempId}.mp3`;
  tempUrls.set(`${tempId}.mp3`, { songPath, expiresAt: Date.now() + 240000 });

  ws.send(
    encryptMessage(
      JSON.stringify({
        action: 'stream-song',
        type: 'url',
        success: true,
        url: `http://URLPATH${tempUrl}`,
        title: title,
        artist: artist,
        image: image,
        duration: duration,
      }),
      key
    )
  );

  if(debug)
    console.log(`🎵 Temporary URL created for ${title} - ${artist}: ${tempUrl}`);
}

module.exports = { handleStreamSong }; 