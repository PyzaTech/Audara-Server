# Audara Server

A modular WebSocket-based music streaming server with authentication and song downloading capabilities.


## Features

- **Modular Architecture**: Clean separation of concerns with dedicated files for different functionalities
- **WebSocket Communication**: Real-time encrypted communication between client and server
- **Authentication**: User login system with database support (MySQL/SQLite)
- **Admin Dashboard**: Comprehensive admin panel with user management, system monitoring, and server controls
- **Song Downloading**: Automatic song downloading from YouTube using yt-dlp
- **Streaming**: Temporary URL generation for secure song streaming
- **Deezer Integration**: Proxy API for Deezer chart and search functionality
- **Playlist Management**: Create, manage, and play user playlists
- **SSL Support**: HTTPS/WSS support with SSL certificates

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure your SSL certificates in the `cert/` directory:
   - `cert1.pem` - SSL certificate
   - `privkey1.pem` - Private key

3. Create the `songs/` directory for downloaded songs:
```bash
mkdir songs
```

4. Start the server:
```bash
node index.js
```

## Dependencies

- `express` - Web framework
- `ws` - WebSocket library
- `mysql2` - MySQL database driver
- `sqlite3` - SQLite database driver
- `ytdlp-nodejs` - YouTube downloading
- `music-metadata` - Audio metadata parsing
- `get-audio-duration` - Audio duration calculation
- `sanitize-filename` - Safe filename generation
- `node-fetch` - HTTP client
- `cheerio` - HTML parsing
- `uuid` - Unique ID generation
- `crypto` - Encryption utilities
- `cors` - Cross-origin resource sharing

## Admin Dashboard

The server includes a comprehensive admin dashboard with the following features:

- **User Management**: View, ban/unban, promote/demote users
- **System Monitoring**: Real-time server statistics and performance metrics
- **Database Management**: Backup and restore database functionality
- **System Logs**: View server logs and diagnostic information
- **Server Controls**: Restart server functionality

For detailed API documentation, see [docs/ADMIN_HANDLERS.md](docs/ADMIN_HANDLERS.md).

## Playlist System

The server includes a comprehensive playlist management system with the following features:

- **Create Playlists**: Users can create named playlists with optional descriptions
- **Add/Remove Songs**: Add songs to playlists and remove them as needed
- **View Playlists**: List all user playlists with song counts
- **Playlist Details**: View detailed information about specific playlists
- **Play Playlists**: Get all songs in a playlist for playback
- **Delete Playlists**: Remove entire playlists

For detailed API documentation, see [docs/PLAYLIST_SYSTEM.md](docs/PLAYLIST_SYSTEM.md).

## Testing

Run the admin handlers test:
```bash
node test/admin_handlers_test.js
```

Run the playlist system test:
```bash
node test_playlist.js
```

## Security Features

- AES-256-CBC encryption for all WebSocket messages
- Session-based authentication
- Admin privilege validation for all admin operations
- Temporary URLs with expiration
- Input sanitization for filenames
- SQL injection prevention with parameterized queries
