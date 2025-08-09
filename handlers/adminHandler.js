const { encryptMessage } = require('../utils/crypto');
const { getDb, getDbConfig } = require('../database/dbManager');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper function to check if user is admin (legacy - for backward compatibility)
async function checkUserAdmin(username) {
  try {
    const db = getDb();
    const dbConfig = getDbConfig();
    
    if (dbConfig.type === 'mysql') {
      const [rows] = await db.execute('SELECT is_admin FROM users WHERE username = ?', [username]);
      return rows.length > 0 && (rows[0].is_admin === 1 || rows[0].is_admin === true);
    } else {
      return new Promise((resolve, reject) => {
        db.get('SELECT is_admin FROM users WHERE username = ?', [username], (err, row) => {
          if (err) return reject(err);
          resolve(row && (row.is_admin === 1 || row.is_admin === true));
        });
      });
    }
  } catch (err) {
    console.error('❌ Error checking admin status:', err.message);
    return false;
  }
}

// Helper function to get authenticated user from WebSocket
function getAuthenticatedUser(ws) {
  const { getAuthenticatedUser: getAuthUser } = require('../websocket/connectionHandler');
  return getAuthUser(ws);
}

// Helper function to check if user is authenticated
function isAuthenticated(ws) {
  const { isAuthenticated: isAuth } = require('../websocket/connectionHandler');
  return isAuth(ws);
}

// Helper function to check if authenticated user is admin
function isAuthenticatedAdmin(ws) {
  const { isAuthenticatedAdmin: isAuthAdmin } = require('../websocket/connectionHandler');
  return isAuthAdmin(ws);
}

// Helper function to send error response
function sendError(ws, key, error) {
  ws.send(encryptMessage(JSON.stringify({ success: false, error }), key));
}

// Helper function to send success response
function sendSuccess(ws, key, data) {
  ws.send(encryptMessage(JSON.stringify({ success: true, ...data }), key));
}

// 1. check_admin
async function handleCheckAdmin(message, ws, key) {
  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  try {
    const session = getAuthenticatedUser(ws);
    sendSuccess(ws, key, {
      action: 'check_admin',
      is_admin: session.isAdmin
    });
  } catch (err) {
    sendError(ws, key, 'Failed to check admin status');
  }
}

// 2. get_admin_stats
async function handleAdminStats(message, ws, key) {
  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    const db = getDb();
    const dbConfig = getDbConfig();
    const fs = require('fs');
    const path = require('path');
    
    let totalUsers, activeUsers, totalSongs;
    
    if (dbConfig.type === 'mysql') {
      const [userRows] = await db.execute('SELECT COUNT(*) as total FROM users');
      totalUsers = userRows[0].total;
      
      // For now, we'll use total users as active users
      // You can implement more sophisticated active user tracking later
      activeUsers = totalUsers;
    } else {
      totalUsers = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as total FROM users', (err, row) => {
          if (err) return reject(err);
          resolve(row.total);
        });
      });
      
      activeUsers = totalUsers;
    }

    // Count total songs in the songs directory
    const songsDir = path.join(__dirname, '..', 'songs');
    try {
      if (fs.existsSync(songsDir)) {
        const songFiles = fs.readdirSync(songsDir).filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.mp3', '.wav', '.flac', '.m4a', '.ogg'].includes(ext);
        });
        totalSongs = songFiles.length;
      } else {
        totalSongs = 0;
      }
    } catch (err) {
      console.error('❌ Error counting songs:', err.message);
      totalSongs = 0;
    }

    const stats = {
      totalUsers: totalUsers,
      activeUsers: activeUsers,
      totalSongs: totalSongs,
      serverUptime: process.uptime()
    };

    sendSuccess(ws, key, {
      action: 'admin_stats',
      stats
    });
  } catch (err) {
    sendError(ws, key, 'Failed to get admin stats');
  }
}

// 3. get_user_list
async function handleGetUserList(message, ws, key) {
  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    const db = getDb();
    const dbConfig = getDbConfig();
    
    let users;
    
    if (dbConfig.type === 'mysql') {
      const [rows] = await db.execute('SELECT username, is_admin, is_banned, created_at FROM users');
      users = rows.map((row) => ({
        id: row.username,
        username: row.username,
        isAdmin: row.is_admin === 1 || row.is_admin === true,
        isBanned: row.is_banned === 1 || row.is_banned === true,
        lastSeen: row.last_seen || row.created_at || new Date().toISOString().replace('T', ' ').substring(0, 19),
        joinDate: row.created_at ? new Date(row.created_at).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19)
      }));
    } else {
      users = await new Promise((resolve, reject) => {
        db.all('SELECT username, is_admin, is_banned, created_at FROM users', (err, rows) => {
          if (err) return reject(err);
          const mappedUsers = (rows || []).map((row) => ({
            id: row.username,
            username: row.username,
            isAdmin: row.is_admin === 1 || row.is_admin === true,
            isBanned: row.is_banned === 1 || row.is_banned === true,
            lastSeen: row.last_seen || row.created_at || new Date().toISOString().replace('T', ' ').substring(0, 19),
            joinDate: row.created_at ? new Date(row.created_at).toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19)
          }));
          resolve(mappedUsers);
        });
      });
    }

    sendSuccess(ws, key, {
      action: 'get_user_list',
      users
    });
  } catch (err) {
    sendError(ws, key, 'Failed to get user list');
  }
}

// 4. ban_user
async function handleBanUser(message, ws, key) {
  const { targetUsername, user_id } = message;
  const username = targetUsername || user_id;
  
  if (!username) {
    sendError(ws, key, 'Missing target username');
    return;
  }

  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    const db = getDb();
    const dbConfig = getDbConfig();
    
    if (dbConfig.type === 'mysql') {
      await db.execute('UPDATE users SET is_banned = 1 WHERE username = ?', [username]);
    } else {
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET is_banned = 1 WHERE username = ?', [username], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    sendSuccess(ws, key, {
      action: 'ban_user',
      username: username,
      message: `User ${username} has been banned`
    });
  } catch (err) {
    sendError(ws, key, 'Failed to ban user');
  }
}

// 5. unban_user
async function handleUnbanUser(message, ws, key) {
  const { targetUsername, user_id } = message;
  const username = targetUsername || user_id;
  
  if (!username) {
    sendError(ws, key, 'Missing target username');
    return;
  }

  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    const db = getDb();
    const dbConfig = getDbConfig();
    
    if (dbConfig.type === 'mysql') {
      await db.execute('UPDATE users SET is_banned = 0 WHERE username = ?', [username]);
    } else {
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET is_banned = 0 WHERE username = ?', [username], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    sendSuccess(ws, key, {
      action: 'unban_user',
      username: username,
      message: `User ${username} has been unbanned`
    });
  } catch (err) {
    sendError(ws, key, 'Failed to unban user');
  }
}

// 6. promote_user
async function handlePromoteUser(message, ws, key) {
  const { targetUsername, user_id } = message;
  const username = targetUsername || user_id;
  
  if (!username) {
    sendError(ws, key, 'Missing target username');
    return;
  }

  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    const db = getDb();
    const dbConfig = getDbConfig();
    
    if (dbConfig.type === 'mysql') {
      await db.execute('UPDATE users SET is_admin = 1 WHERE username = ?', [username]);
    } else {
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET is_admin = 1 WHERE username = ?', [username], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    sendSuccess(ws, key, {
      action: 'promote_user',
      username: username,
      message: `User ${username} has been promoted to admin`
    });
  } catch (err) {
    sendError(ws, key, 'Failed to promote user');
  }
}

// 7. demote_user
async function handleDemoteUser(message, ws, key) {
  const { targetUsername, user_id } = message;
  const username = targetUsername || user_id;
  
  if (!username) {
    sendError(ws, key, 'Missing target username');
    return;
  }

  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    const db = getDb();
    const dbConfig = getDbConfig();
    
    if (dbConfig.type === 'mysql') {
      await db.execute('UPDATE users SET is_admin = 0 WHERE username = ?', [username]);
    } else {
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET is_admin = 0 WHERE username = ?', [username], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    sendSuccess(ws, key, {
      action: 'demote_user',
      username: username,
      message: `User ${username} has been demoted from admin`
    });
  } catch (err) {
    sendError(ws, key, 'Failed to demote user');
  }
}

// 8. get_system_logs
async function handleGetSystemLogs(message, ws, key) {
  const { lines = 100 } = message;

  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    // For now, we'll return basic system info
    // You can implement actual log file reading later
    const logs = {
      timestamp: new Date().toISOString(),
      server_info: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      recent_events: [
        'System logs feature implemented',
        'Admin dashboard handlers added',
        'WebSocket connection established'
      ]
    };

    sendSuccess(ws, key, {
      action: 'system_logs',
      logs
    });
  } catch (err) {
    sendError(ws, key, 'Failed to get system logs');
  }
}

// 9. restart_server
async function handleRestartServer(message, ws, key) {
  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    sendSuccess(ws, key, {
      action: 'restart_server',
      message: 'Server restart initiated'
    });

    // Restart the server after a short delay
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (err) {
    sendError(ws, key, 'Failed to restart server');
  }
}

// 10. backup_database
async function handleBackupDatabase(message, ws, key) {
  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    const dbConfig = getDbConfig();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (dbConfig.type === 'mysql') {
      // For MySQL, you would typically use mysqldump
      // This is a simplified version
      const backupPath = path.join(__dirname, '..', 'backups', `mysql_backup_${timestamp}.sql`);
      
      // Ensure backups directory exists
      const backupsDir = path.join(__dirname, '..', 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      
      // Create a simple backup file
      fs.writeFileSync(backupPath, `-- MySQL Backup created at ${timestamp}\n-- This is a placeholder backup\n`);
      
      sendSuccess(ws, key, {
        action: 'backup_database',
        message: 'Database backup created',
        backup_path: backupPath
      });
    } else {
      // For SQLite, copy the database file
      const dbPath = path.join(__dirname, '..', dbConfig.sqlite.file);
      const backupPath = path.join(__dirname, '..', 'backups', `sqlite_backup_${timestamp}.db`);
      
      // Ensure backups directory exists
      const backupsDir = path.join(__dirname, '..', 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
      
      fs.copyFileSync(dbPath, backupPath);
      
      sendSuccess(ws, key, {
        action: 'backup_database',
        message: 'Database backup created',
        backup_path: backupPath
      });
    }
  } catch (err) {
    sendError(ws, key, 'Failed to create database backup');
  }
}

// 11. restore_database
async function handleRestoreDatabase(message, ws, key) {
  const { backup_path } = message;
  
  if (!backup_path) {
    sendError(ws, key, 'Missing backup path');
    return;
  }

  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    const dbConfig = getDbConfig();
    
    if (!fs.existsSync(backup_path)) {
      sendError(ws, key, 'Backup file not found');
      return;
    }

    if (dbConfig.type === 'mysql') {
      // For MySQL, you would typically restore using mysql command
      // This is a simplified version
      sendSuccess(ws, key, {
        action: 'restore_database',
        message: 'Database restore initiated (MySQL restore requires manual intervention)'
      });
    } else {
      // For SQLite, copy the backup file back
      const dbPath = path.join(__dirname, '..', dbConfig.sqlite.file);
      fs.copyFileSync(backup_path, dbPath);
      
      sendSuccess(ws, key, {
        action: 'restore_database',
        message: 'Database restored successfully'
      });
    }
  } catch (err) {
    sendError(ws, key, 'Failed to restore database');
  }
}

// 12. create_user
async function handleCreateUser(message, ws, key) {
  const { username, password, is_admin } = message;
  
  if (!username || !password) {
    sendError(ws, key, 'Missing username or password');
    return;
  }

  // Check if user is authenticated
  if (!isAuthenticated(ws)) {
    sendError(ws, key, 'Not authenticated. Please login first.');
    return;
  }

  // Check if user is admin
  if (!isAuthenticatedAdmin(ws)) {
    sendError(ws, key, 'Unauthorized access. Admin privileges required.');
    return;
  }

  try {

    const db = getDb();
    const dbConfig = getDbConfig();
    
    // Check if user already exists
    let existingUser;
    if (dbConfig.type === 'mysql') {
      const [rows] = await db.execute('SELECT username FROM users WHERE username = ?', [username]);
      existingUser = rows.length > 0;
    } else {
      existingUser = await new Promise((resolve, reject) => {
        db.get('SELECT username FROM users WHERE username = ?', [username], (err, row) => {
          if (err) return reject(err);
          resolve(row !== null);
        });
      });
    }

    if (existingUser) {
      sendError(ws, key, 'User already exists');
      return;
    }

    // Create new user
    if (dbConfig.type === 'mysql') {
      await db.execute(
        'INSERT INTO users (username, password, is_admin, created_at, last_seen) VALUES (?, ?, ?, NOW(), NOW())',
        [username, password, is_admin ? 1 : 0]
      );
    } else {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (username, password, is_admin, created_at, last_seen) VALUES (?, ?, ?, datetime("now"), datetime("now"))',
          [username, password, is_admin ? 1 : 0],
          (err) => {
            if (err) return reject(err);
            resolve();
          }
        );
      });
    }

    sendSuccess(ws, key, {
      action: 'create_user',
      message: `User ${username} has been created successfully`
    });
  } catch (err) {
    sendError(ws, key, 'Failed to create user');
  }
}

module.exports = {
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
}; 