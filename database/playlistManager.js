const { getDb, getDbConfig } = require('./dbManager');
const { v4: uuidv4 } = require('uuid');

async function createPlaylistTable() {
  const db = getDb();
  const dbConfig = getDbConfig();
  
  const playlistsSql = `
    CREATE TABLE IF NOT EXISTS playlists (
      id ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      name ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      description ${dbConfig.type === 'mysql' ? 'TEXT' : 'TEXT'},
      username ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      created_at ${dbConfig.type === 'mysql' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT ${dbConfig.type === 'mysql' ? 'CURRENT_TIMESTAMP' : 'CURRENT_TIMESTAMP'},
      FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
    );
  `;

  const playlistSongsSql = `
    CREATE TABLE IF NOT EXISTS playlist_songs (
      id ${dbConfig.type === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      playlist_id ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      song_id ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      title ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      artist ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      image ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'},
      duration ${dbConfig.type === 'mysql' ? 'INT' : 'INTEGER'} NOT NULL,
      url ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'},
      added_at ${dbConfig.type === 'mysql' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT ${dbConfig.type === 'mysql' ? 'CURRENT_TIMESTAMP' : 'CURRENT_TIMESTAMP'},
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
  `;

  try {
    if (dbConfig.type === 'mysql') {
      await db.execute(playlistsSql);
      await db.execute(playlistSongsSql);
      console.log('✅ Playlist tables are ready in MySQL.');
    } else {
      db.serialize(() => {
        db.run(playlistsSql, (err) => {
          if (err) console.error('❌ Failed to create playlists table in SQLite:', err.message);
          else console.log('✅ Playlists table is ready in SQLite.');
        });
        db.run(playlistSongsSql, (err) => {
          if (err) console.error('❌ Failed to create playlist_songs table in SQLite:', err.message);
          else console.log('✅ Playlist_songs table is ready in SQLite.');
        });
      });
    }
  } catch (err) {
    console.error('❌ Failed to create playlist tables:', err.message);
  }
}

async function createPlaylist(username, name, description) {
  const db = getDb();
  const dbConfig = getDbConfig();
  const playlistId = uuidv4();

  try {
    if (dbConfig.type === 'mysql') {
      await db.execute(
        'INSERT INTO playlists (id, name, description, username) VALUES (?, ?, ?, ?)',
        [playlistId, name, description, username]
      );
    } else {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO playlists (id, name, description, username) VALUES (?, ?, ?, ?)',
          [playlistId, name, description, username],
          function(err) {
            if (err) return reject(err);
            resolve(playlistId);
          }
        );
      });
    }
    return playlistId;
  } catch (err) {
    console.error('❌ Create playlist error:', err.message);
    throw err;
  }
}

async function getUserPlaylists(username) {
  const db = getDb();
  const dbConfig = getDbConfig();

  try {
    if (dbConfig.type === 'mysql') {
      const [rows] = await db.execute(`
        SELECT p.*, COUNT(ps.id) as songCount
        FROM playlists p
        LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
        WHERE p.username = ?
        GROUP BY p.id
        ORDER BY p.created_at DESC
      `, [username]);
      
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        songCount: parseInt(row.songCount),
        createdAt: row.created_at,
        songs: []
      }));
    } else {
      return new Promise((resolve, reject) => {
        db.all(`
          SELECT p.*, COUNT(ps.id) as songCount
          FROM playlists p
          LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
          WHERE p.username = ?
          GROUP BY p.id
          ORDER BY p.created_at DESC
        `, [username], (err, rows) => {
          if (err) return reject(err);
          resolve(rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            songCount: parseInt(row.songCount),
            createdAt: row.created_at,
            songs: []
          })));
        });
      });
    }
  } catch (err) {
    console.error('❌ Get user playlists error:', err.message);
    throw err;
  }
}

async function getPlaylistSongs(playlistId, username) {
  const db = getDb();
  const dbConfig = getDbConfig();

  try {
    if (dbConfig.type === 'mysql') {
      // First check if playlist exists and user has access
      const [playlistRows] = await db.execute(
        'SELECT * FROM playlists WHERE id = ? AND username = ?',
        [playlistId, username]
      );
      
      if (playlistRows.length === 0) {
        return null;
      }

      const playlist = playlistRows[0];
      
      // Get songs in the playlist
      const [songRows] = await db.execute(
        'SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY added_at ASC',
        [playlistId]
      );

      return {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        songCount: songRows.length,
        createdAt: playlist.created_at,
        songs: songRows.map(song => ({
          id: song.song_id,
          title: song.title,
          artist: song.artist,
          image: song.image,
          duration: song.duration
        }))
      };
    } else {
      return new Promise((resolve, reject) => {
        // First check if playlist exists and user has access
        db.get(
          'SELECT * FROM playlists WHERE id = ? AND username = ?',
          [playlistId, username],
          (err, playlist) => {
            if (err) return reject(err);
            if (!playlist) return resolve(null);

            // Get songs in the playlist
            db.all(
              'SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY added_at ASC',
              [playlistId],
              (err, songs) => {
                if (err) return reject(err);
                
                resolve({
                  id: playlist.id,
                  name: playlist.name,
                  description: playlist.description,
                  songCount: songs.length,
                  createdAt: playlist.created_at,
                  songs: songs.map(song => ({
                    id: song.song_id,
                    title: song.title,
                    artist: song.artist,
                    image: song.image,
                    duration: song.duration
                  }))
                });
              }
            );
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Get playlist songs error:', err.message);
    throw err;
  }
}

async function addSongToPlaylist(playlistId, song, username) {
  const db = getDb();
  const dbConfig = getDbConfig();

  // Validate required song fields with detailed error messages
  const missingFields = [];
  if (!song.id) missingFields.push('id');
  if (!song.title) missingFields.push('title');
  if (!song.artist) missingFields.push('artist');
  
  // Handle duration validation with better error messages
  if (song.duration === undefined || song.duration === null) {
    missingFields.push('duration (field is missing)');
  } else if (typeof song.duration !== 'number') {
    missingFields.push(`duration (must be a number, got ${typeof song.duration}: ${song.duration})`);
  } else if (song.duration <= 0) {
    missingFields.push(`duration (must be positive number > 0, got ${song.duration}. Duration should be in seconds, e.g., 180 for 3 minutes)`);
  }
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required song fields: ${missingFields.join(', ')}. Received song data: ${JSON.stringify(song)}`);
  }

  // Ensure all values are properly defined
  const songData = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    image: song.image || null,
    duration: song.duration,
    url: song.url || null
  };

  try {
    if (dbConfig.type === 'mysql') {
      // First check if playlist exists and user has access
      const [playlistRows] = await db.execute(
        'SELECT id FROM playlists WHERE id = ? AND username = ?',
        [playlistId, username]
      );
      
      if (playlistRows.length === 0) {
        throw new Error('Playlist not found or access denied');
      }

      // Check if song already exists in playlist
      const [existingRows] = await db.execute(
        'SELECT id FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
        [playlistId, song.id]
      );
      
      if (existingRows.length > 0) {
        throw new Error('Song already exists in playlist');
      }

      // Add song to playlist
      await db.execute(
        'INSERT INTO playlist_songs (playlist_id, song_id, title, artist, image, duration, url) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [playlistId, songData.id, songData.title, songData.artist, songData.image, songData.duration, songData.url]
      );
    } else {
      return new Promise((resolve, reject) => {
        // First check if playlist exists and user has access
        db.get(
          'SELECT id FROM playlists WHERE id = ? AND username = ?',
          [playlistId, username],
          (err, playlist) => {
            if (err) return reject(err);
            if (!playlist) return reject(new Error('Playlist not found or access denied'));

            // Check if song already exists in playlist
            db.get(
              'SELECT id FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
              [playlistId, song.id],
              (err, existing) => {
                if (err) return reject(err);
                if (existing) return reject(new Error('Song already exists in playlist'));

                // Add song to playlist
                db.run(
                  'INSERT INTO playlist_songs (playlist_id, song_id, title, artist, image, duration, url) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  [playlistId, songData.id, songData.title, songData.artist, songData.image, songData.duration, songData.url],
                  function(err) {
                    if (err) return reject(err);
                    resolve();
                  }
                );
              }
            );
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Add song to playlist error:', err.message);
    throw err;
  }
}

async function removeSongFromPlaylist(playlistId, songId, username) {
  const db = getDb();
  const dbConfig = getDbConfig();

  try {
    if (dbConfig.type === 'mysql') {
      // First check if playlist exists and user has access
      const [playlistRows] = await db.execute(
        'SELECT id FROM playlists WHERE id = ? AND username = ?',
        [playlistId, username]
      );
      
      if (playlistRows.length === 0) {
        throw new Error('Playlist not found or access denied');
      }

      // Remove song from playlist
      const [result] = await db.execute(
        'DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
        [playlistId, songId]
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Song not found in playlist');
      }
    } else {
      return new Promise((resolve, reject) => {
        // First check if playlist exists and user has access
        db.get(
          'SELECT id FROM playlists WHERE id = ? AND username = ?',
          [playlistId, username],
          (err, playlist) => {
            if (err) return reject(err);
            if (!playlist) return reject(new Error('Playlist not found or access denied'));

            // Remove song from playlist
            db.run(
              'DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?',
              [playlistId, songId],
              function(err) {
                if (err) return reject(err);
                if (this.changes === 0) {
                  return reject(new Error('Song not found in playlist'));
                }
                resolve();
              }
            );
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Remove song from playlist error:', err.message);
    throw err;
  }
}

async function deletePlaylist(playlistId, username) {
  const db = getDb();
  const dbConfig = getDbConfig();

  try {
    if (dbConfig.type === 'mysql') {
      // Delete playlist (cascade will handle playlist_songs)
      const [result] = await db.execute(
        'DELETE FROM playlists WHERE id = ? AND username = ?',
        [playlistId, username]
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Playlist not found or access denied');
      }
    } else {
      return new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM playlists WHERE id = ? AND username = ?',
          [playlistId, username],
          function(err) {
            if (err) return reject(err);
            if (this.changes === 0) {
              return reject(new Error('Playlist not found or access denied'));
            }
            resolve();
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Delete playlist error:', err.message);
    throw err;
  }
}

async function getPlaylistForPlayback(playlistId, username) {
  const db = getDb();
  const dbConfig = getDbConfig();

  try {
    if (dbConfig.type === 'mysql') {
      // First check if playlist exists and user has access
      const [playlistRows] = await db.execute(
        'SELECT * FROM playlists WHERE id = ? AND username = ?',
        [playlistId, username]
      );
      
      if (playlistRows.length === 0) {
        return null;
      }

      // Get songs with URLs for playback
      const [songRows] = await db.execute(
        'SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY added_at ASC',
        [playlistId]
      );

      return songRows.map(song => ({
        id: song.song_id,
        title: song.title,
        artist: song.artist,
        image: song.image,
        duration: song.duration,
        url: song.url
      }));
    } else {
      return new Promise((resolve, reject) => {
        // First check if playlist exists and user has access
        db.get(
          'SELECT * FROM playlists WHERE id = ? AND username = ?',
          [playlistId, username],
          (err, playlist) => {
            if (err) return reject(err);
            if (!playlist) return resolve(null);

            // Get songs with URLs for playback
            db.all(
              'SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY added_at ASC',
              [playlistId],
              (err, songs) => {
                if (err) return reject(err);
                
                resolve(songs.map(song => ({
                  id: song.song_id,
                  title: song.title,
                  artist: song.artist,
                  image: song.image,
                  duration: song.duration,
                  url: song.url
                })));
              }
            );
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Get playlist for playback error:', err.message);
    throw err;
  }
}

module.exports = {
  createPlaylistTable,
  createPlaylist,
  getUserPlaylists,
  getPlaylistSongs,
  addSongToPlaylist,
  removeSongFromPlaylist,
  deletePlaylist,
  getPlaylistForPlayback
}; 