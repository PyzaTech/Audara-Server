const WebSocket = require('ws');
const crypto = require('crypto');

// Test configuration
const WS_URL = 'ws://localhost:3003';
const TEST_USER = 'testuser';
const TEST_PASSWORD = 'testpass';

// Encryption functions (matching server implementation)
function encryptMessage(message, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(message, 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('base64'), data: encrypted.toString('base64') });
}

function decryptMessage(encryptedData, key) {
  try {
    const data = JSON.parse(encryptedData);
    const iv = Buffer.from(data.iv, 'base64');
    const encryptedText = Buffer.from(data.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('❌ Decryption error:', error.message);
    return null;
  }
}

async function testPlaylistSystem() {
  console.log('🧪 Starting playlist system test...\n');

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let sessionKey = null;
    let isAuthenticated = false;
    let createdPlaylistId = null;

    ws.on('open', () => {
      console.log('✅ Connected to WebSocket server');
    });

    ws.on('message', async (data) => {
      try {
        let message;
        
        if (!sessionKey) {
          // First message should be session key
          const sessionData = JSON.parse(data.toString());
          if (sessionData.type === 'session-key') {
            sessionKey = Buffer.from(sessionData.key, 'base64');
            console.log('✅ Received session key');
            
            // Send login request
            const loginMessage = {
              action: 'login',
              username: TEST_USER,
              password: TEST_PASSWORD
            };
            ws.send(encryptMessage(JSON.stringify(loginMessage), sessionKey));
          }
        } else {
          // Decrypt and parse message
          const decrypted = decryptMessage(data, sessionKey);
          if (!decrypted) return;
          
          message = JSON.parse(decrypted);
          
          if (message.action === 'login') {
            if (message.success) {
              console.log('✅ Login successful');
              isAuthenticated = true;
              
              // Test 1: Create playlist
              console.log('\n📝 Test 1: Creating playlist...');
              const createPlaylistMessage = {
                action: 'create_playlist',
                name: 'Test Playlist',
                description: 'A test playlist for testing purposes'
              };
              ws.send(encryptMessage(JSON.stringify(createPlaylistMessage), sessionKey));
            } else {
              console.log('❌ Login failed:', message.error);
              ws.close();
              reject(new Error('Login failed'));
            }
          } else if (message.action === 'create_playlist') {
            if (message.success) {
              console.log('✅ Playlist created with ID:', message.playlist_id);
              createdPlaylistId = message.playlist_id;
              
              // Test 2: Get playlists
              console.log('\n📋 Test 2: Getting playlists...');
              const getPlaylistsMessage = {
                action: 'get_playlists'
              };
              ws.send(encryptMessage(JSON.stringify(getPlaylistsMessage), sessionKey));
            } else {
              console.log('❌ Create playlist failed:', message.error);
            }
          } else if (message.action === 'get_playlists') {
            console.log('✅ Retrieved playlists:', message.playlists.length, 'playlists found');
            
            // Test 3: Add song to playlist
            console.log('\n🎵 Test 3: Adding song to playlist...');
            const addSongMessage = {
              action: 'add_song_to_playlist',
              playlist_id: createdPlaylistId,
              song: {
                id: 'test_song_1',
                title: 'Test Song',
                artist: 'Test Artist',
                image: 'https://example.com/image.jpg',
                duration: 180,
                url: 'https://example.com/stream/test_song_1'
              }
            };
            ws.send(encryptMessage(JSON.stringify(addSongMessage), sessionKey));
          } else if (message.action === 'add_song_to_playlist') {
            if (message.success) {
              console.log('✅ Song added to playlist');
              
              // Test 4: Get playlist songs
              console.log('\n🎼 Test 4: Getting playlist songs...');
              const getSongsMessage = {
                action: 'get_playlist_songs',
                playlist_id: createdPlaylistId
              };
              ws.send(encryptMessage(JSON.stringify(getSongsMessage), sessionKey));
            } else {
              console.log('❌ Add song failed:', message.error);
            }
          } else if (message.action === 'get_playlist_songs') {
            console.log('✅ Retrieved playlist songs:', message.playlist.songs.length, 'songs');
            
            // Test 5: Play playlist
            console.log('\n▶️ Test 5: Playing playlist...');
            const playPlaylistMessage = {
              action: 'play_playlist',
              playlist_id: createdPlaylistId
            };
            ws.send(encryptMessage(JSON.stringify(playPlaylistMessage), sessionKey));
          } else if (message.action === 'play_playlist') {
            if (message.success) {
              console.log('✅ Playlist ready for playback:', message.songs.length, 'songs');
              
              // Test 6: Remove song from playlist
              console.log('\n🗑️ Test 6: Removing song from playlist...');
              const removeSongMessage = {
                action: 'remove_song_from_playlist',
                playlist_id: createdPlaylistId,
                song_id: 'test_song_1'
              };
              ws.send(encryptMessage(JSON.stringify(removeSongMessage), sessionKey));
            } else {
              console.log('❌ Play playlist failed:', message.error);
            }
          } else if (message.action === 'remove_song_from_playlist') {
            if (message.success) {
              console.log('✅ Song removed from playlist');
              
              // Test 7: Delete playlist
              console.log('\n🗑️ Test 7: Deleting playlist...');
              const deletePlaylistMessage = {
                action: 'delete_playlist',
                playlist_id: createdPlaylistId
              };
              ws.send(encryptMessage(JSON.stringify(deletePlaylistMessage), sessionKey));
            } else {
              console.log('❌ Remove song failed:', message.error);
            }
          } else if (message.action === 'delete_playlist') {
            if (message.success) {
              console.log('✅ Playlist deleted successfully');
              console.log('\n🎉 All playlist tests completed successfully!');
              ws.close();
              resolve();
            } else {
              console.log('❌ Delete playlist failed:', message.error);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error processing message:', error.message);
        ws.close();
        reject(error);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      reject(error);
    });

    ws.on('close', () => {
      console.log('🔌 WebSocket connection closed');
    });
  });
}

// Run the test
testPlaylistSystem()
  .then(() => {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }); 