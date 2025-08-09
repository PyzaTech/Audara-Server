const { generateSessionKey, decryptMessage, encryptMessage } = require('../utils/crypto');
const { handleLogin } = require('../handlers/loginHandler');
const { handleHeartbeat } = require('../handlers/heartbeatHandler');
const { handleStreamSong } = require('../handlers/streamSongHandler');
const {
  handleCheckAdmin,
  handleAdminStats,
  handleGetUserList,
  handleBanUser,
  handleUnbanUser,
  handlePromoteUser,
  handleDemoteUser,
  handleGetSystemLogs,
  handleRestartServer,
  handleBackupDatabase,
  handleRestoreDatabase,
  handleCreateUser
} = require('../handlers/adminHandler');
const {
  handleCreatePlaylist,
  handleGetPlaylists,
  handleGetPlaylistSongs,
  handleAddSongToPlaylist,
  handleRemoveSongFromPlaylist,
  handleDeletePlaylist,
  handlePlayPlaylist
} = require('../handlers/playlistHandler');

// Global session storage: Map<WebSocket, {username: string, isAdmin: boolean, sessionKey: Buffer}>
const authenticatedSessions = new Map();

// Helper function to get authenticated user from WebSocket
function getAuthenticatedUser(ws) {
  return authenticatedSessions.get(ws) || null;
}

// Helper function to check if user is authenticated
function isAuthenticated(ws) {
  return authenticatedSessions.has(ws);
}

// Helper function to check if authenticated user is admin
function isAuthenticatedAdmin(ws) {
  const session = authenticatedSessions.get(ws);
  return session && session.isAdmin;
}

function handleConnection(ws, req, tempUrls, debug) {
  const sessionKey = generateSessionKey();
  const clients = new Map();
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
        case 'login':
          handleLogin(message, ws, key);
          break;
        case 'heartbeat':
          handleHeartbeat(debug);
          break;
        case 'stream-song':
          await handleStreamSong(message, ws, key, tempUrls, debug);
          break;
        // Admin Dashboard Handlers - Now use authenticated session
        case 'check_admin':
          await handleCheckAdmin(message, ws, key);
          break;
        case 'admin_stats':
          await handleAdminStats(message, ws, key);
          break;
        case 'get_user_list':
          await handleGetUserList(message, ws, key);
          break;
        case 'ban_user':
          await handleBanUser(message, ws, key);
          break;
        case 'unban_user':
          await handleUnbanUser(message, ws, key);
          break;
        case 'promote_user':
          await handlePromoteUser(message, ws, key);
          break;
        case 'demote_user':
          await handleDemoteUser(message, ws, key);
          break;
        case 'get_system_logs':
          await handleGetSystemLogs(message, ws, key);
          break;
        case 'restart_server':
          await handleRestartServer(message, ws, key);
          break;
        case 'backup_database':
          await handleBackupDatabase(message, ws, key);
          break;
        case 'restore_database':
          await handleRestoreDatabase(message, ws, key);
          break;
        case 'create_user':
          await handleCreateUser(message, ws, key);
          break;
        // Playlist Management Handlers
        case 'create_playlist':
          await handleCreatePlaylist(message, ws, key);
          break;
        case 'get_playlists':
          await handleGetPlaylists(message, ws, key);
          break;
        case 'get_playlist_songs':
          await handleGetPlaylistSongs(message, ws, key);
          break;
        case 'add_song_to_playlist':
          await handleAddSongToPlaylist(message, ws, key);
          break;
        case 'remove_song_from_playlist':
          await handleRemoveSongFromPlaylist(message, ws, key);
          break;
        case 'delete_playlist':
          await handleDeletePlaylist(message, ws, key);
          break;
        case 'play_playlist':
          await handlePlayPlaylist(message, ws, key);
          break;
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
    // Clean up authenticated session
    authenticatedSessions.delete(ws);
  });
}

module.exports = { 
  handleConnection, 
  getAuthenticatedUser, 
  isAuthenticated, 
  isAuthenticatedAdmin,
  authenticatedSessions 
}; 