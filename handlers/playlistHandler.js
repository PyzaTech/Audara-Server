const { encryptMessage } = require('../utils/crypto');
const { 
  createPlaylist, 
  getUserPlaylists, 
  getPlaylistSongs, 
  addSongToPlaylist, 
  removeSongFromPlaylist, 
  deletePlaylist,
  getPlaylistForPlayback
} = require('../database/playlistManager');
// We'll get the authenticated user from the global session storage
function getAuthenticatedUser(ws) {
  const { authenticatedSessions } = require('../websocket/connectionHandler');
  return authenticatedSessions.get(ws) || null;
}

async function handleCreatePlaylist(message, ws, key) {
  const user = getAuthenticatedUser(ws);
  if (!user) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "create_playlist", 
      success: false, 
      error: 'Authentication required' 
    }), key));
    return;
  }

  const { name, description = '' } = message;
  
  if (!name) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "create_playlist", 
      success: false, 
      error: 'Playlist name is required' 
    }), key));
    return;
  }

  try {
    const playlistId = await createPlaylist(user.username, name, description);
    ws.send(encryptMessage(JSON.stringify({
      action: "create_playlist",
      success: true,
      playlist_id: playlistId
    }), key));
  } catch (error) {
    console.error('❌ Create playlist error:', error.message);
    ws.send(encryptMessage(JSON.stringify({
      action: "create_playlist",
      success: false,
      error: 'Failed to create playlist'
    }), key));
  }
}

async function handleGetPlaylists(message, ws, key) {
  const user = getAuthenticatedUser(ws);
  if (!user) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "get_playlists", 
      success: false, 
      error: 'Authentication required' 
    }), key));
    return;
  }

  try {
    const playlists = await getUserPlaylists(user.username);
    ws.send(encryptMessage(JSON.stringify({
      action: "get_playlists",
      playlists: playlists
    }), key));
  } catch (error) {
    console.error('❌ Get playlists error:', error.message);
    ws.send(encryptMessage(JSON.stringify({
      action: "get_playlists",
      success: false,
      error: 'Failed to fetch playlists'
    }), key));
  }
}

async function handleGetPlaylistSongs(message, ws, key) {
  const user = getAuthenticatedUser(ws);
  if (!user) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "get_playlist_songs", 
      success: false, 
      error: 'Authentication required' 
    }), key));
    return;
  }

  const { playlist_id } = message;
  
  if (!playlist_id) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "get_playlist_songs", 
      success: false, 
      error: 'Playlist ID is required' 
    }), key));
    return;
  }

  try {
    const playlist = await getPlaylistSongs(playlist_id, user.username);
    if (!playlist) {
      ws.send(encryptMessage(JSON.stringify({
        action: "get_playlist_songs",
        success: false,
        error: 'Playlist not found or access denied'
      }), key));
      return;
    }
    
    ws.send(encryptMessage(JSON.stringify({
      action: "get_playlist_songs",
      playlist: playlist
    }), key));
  } catch (error) {
    console.error('❌ Get playlist songs error:', error.message);
    ws.send(encryptMessage(JSON.stringify({
      action: "get_playlist_songs",
      success: false,
      error: 'Failed to fetch playlist songs'
    }), key));
  }
}

async function handleAddSongToPlaylist(message, ws, key) {
  const user = getAuthenticatedUser(ws);
  if (!user) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "add_song_to_playlist", 
      success: false, 
      error: 'Authentication required' 
    }), key));
    return;
  }

  const { playlist_id, song } = message;
  
  if (!playlist_id || !song) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "add_song_to_playlist", 
      success: false, 
      error: 'Playlist ID and song data are required' 
    }), key));
    return;
  }

  try {
    await addSongToPlaylist(playlist_id, song, user.username);
    ws.send(encryptMessage(JSON.stringify({
      action: "add_song_to_playlist",
      success: true
    }), key));
  } catch (error) {
    console.error('❌ Add song to playlist error:', error.message);
    ws.send(encryptMessage(JSON.stringify({
      action: "add_song_to_playlist",
      success: false,
      error: 'Failed to add song to playlist'
    }), key));
  }
}

async function handleRemoveSongFromPlaylist(message, ws, key) {
  const user = getAuthenticatedUser(ws);
  if (!user) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "remove_song_from_playlist", 
      success: false, 
      error: 'Authentication required' 
    }), key));
    return;
  }

  const { playlist_id, song_id } = message;
  
  if (!playlist_id || !song_id) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "remove_song_from_playlist", 
      success: false, 
      error: 'Playlist ID and song ID are required' 
    }), key));
    return;
  }

  try {
    await removeSongFromPlaylist(playlist_id, song_id, user.username);
    ws.send(encryptMessage(JSON.stringify({
      action: "remove_song_from_playlist",
      success: true
    }), key));
  } catch (error) {
    console.error('❌ Remove song from playlist error:', error.message);
    ws.send(encryptMessage(JSON.stringify({
      action: "remove_song_from_playlist",
      success: false,
      error: 'Failed to remove song from playlist'
    }), key));
  }
}

async function handleDeletePlaylist(message, ws, key) {
  const user = getAuthenticatedUser(ws);
  if (!user) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "delete_playlist", 
      success: false, 
      error: 'Authentication required' 
    }), key));
    return;
  }

  const { playlist_id } = message;
  
  if (!playlist_id) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "delete_playlist", 
      success: false, 
      error: 'Playlist ID is required' 
    }), key));
    return;
  }

  try {
    await deletePlaylist(playlist_id, user.username);
    ws.send(encryptMessage(JSON.stringify({
      action: "delete_playlist",
      success: true
    }), key));
  } catch (error) {
    console.error('❌ Delete playlist error:', error.message);
    ws.send(encryptMessage(JSON.stringify({
      action: "delete_playlist",
      success: false,
      error: 'Failed to delete playlist'
    }), key));
  }
}

async function handlePlayPlaylist(message, ws, key) {
  const user = getAuthenticatedUser(ws);
  if (!user) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "play_playlist", 
      success: false, 
      error: 'Authentication required' 
    }), key));
    return;
  }

  const { playlist_id } = message;
  
  if (!playlist_id) {
    ws.send(encryptMessage(JSON.stringify({ 
      action: "play_playlist", 
      success: false, 
      error: 'Playlist ID is required' 
    }), key));
    return;
  }

  try {
    const songs = await getPlaylistForPlayback(playlist_id, user.username);
    if (!songs) {
      ws.send(encryptMessage(JSON.stringify({
        action: "play_playlist",
        success: false,
        error: 'Playlist not found or access denied'
      }), key));
      return;
    }
    
    ws.send(encryptMessage(JSON.stringify({
      action: "play_playlist",
      success: true,
      songs: songs
    }), key));
  } catch (error) {
    console.error('❌ Play playlist error:', error.message);
    ws.send(encryptMessage(JSON.stringify({
      action: "play_playlist",
      success: false,
      error: 'Failed to get playlist for playback'
    }), key));
  }
}

module.exports = {
  handleCreatePlaylist,
  handleGetPlaylists,
  handleGetPlaylistSongs,
  handleAddSongToPlaylist,
  handleRemoveSongFromPlaylist,
  handleDeletePlaylist,
  handlePlayPlaylist
}; 