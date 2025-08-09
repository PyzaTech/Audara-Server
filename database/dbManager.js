const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();

let db;
let dbConfig;

async function initDatabase() {
  dbConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db-config.json'), 'utf8'));
  
  try {
    if (dbConfig.type === 'mysql') {
      db = mysql.createPool({
        host: dbConfig.mysql.host,
        user: dbConfig.mysql.user,
        password: dbConfig.mysql.password,
        database: dbConfig.mysql.database,
      });
    } else {
      const sqliteFile = path.join(__dirname, '..', dbConfig.sqlite.file);
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

async function createUsersTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      username ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} PRIMARY KEY,
      password ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'} NOT NULL,
      profile_picture ${dbConfig.type === 'mysql' ? 'VARCHAR(255)' : 'TEXT'},
      is_admin ${dbConfig.type === 'mysql' ? 'BOOLEAN' : 'INTEGER'} DEFAULT 0,
      is_banned ${dbConfig.type === 'mysql' ? 'BOOLEAN' : 'INTEGER'} DEFAULT 0,
      created_at ${dbConfig.type === 'mysql' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT ${dbConfig.type === 'mysql' ? 'CURRENT_TIMESTAMP' : 'CURRENT_TIMESTAMP'},
      last_seen ${dbConfig.type === 'mysql' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT ${dbConfig.type === 'mysql' ? 'CURRENT_TIMESTAMP' : 'CURRENT_TIMESTAMP'}
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

async function validateLogin(username, password) {
  try {
    if (dbConfig.type === 'mysql') {
      const [rows] = await db.execute('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
      return rows.length > 0 ? rows[0] : null;
    } else {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        });
      });
    }
  } catch (err) {
    console.error('❌ Database error:', err.message);
    return null;
  }
}

function getDb() {
  return db;
}

function getDbConfig() {
  return dbConfig;
}

module.exports = { 
  initDatabase, 
  validateLogin, 
  getDb, 
  getDbConfig 
}; 