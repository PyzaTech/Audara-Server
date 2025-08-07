const { getDb, getDbConfig } = require('./dbManager');

async function createAdminUser(username, password, profilePicture = null) {
  const db = getDb();
  const dbConfig = getDbConfig();

  try {
    if (dbConfig.type === 'mysql') {
      const [result] = await db.execute(
        'INSERT INTO users (username, password, profile_picture, is_admin) VALUES (?, ?, ?, 1)',
        [username, password, profilePicture]
      );
      console.log(`✅ Admin user '${username}' created successfully`);
      return result.insertId;
    } else {
      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (username, password, profile_picture, is_admin) VALUES (?, ?, ?, 1)',
          [username, password, profilePicture],
          function(err) {
            if (err) {
              console.error('❌ Error creating admin user:', err.message);
              reject(err);
            } else {
              console.log(`✅ Admin user '${username}' created successfully`);
              resolve(this.lastID);
            }
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Error creating admin user:', err.message);
    throw err;
  }
}

async function promoteToAdmin(username) {
  const db = getDb();
  const dbConfig = getDbConfig();

  try {
    if (dbConfig.type === 'mysql') {
      const [result] = await db.execute(
        'UPDATE users SET is_admin = 1 WHERE username = ?',
        [username]
      );
      if (result.affectedRows > 0) {
        console.log(`✅ User '${username}' promoted to admin`);
        return true;
      } else {
        console.log(`❌ User '${username}' not found`);
        return false;
      }
    } else {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET is_admin = 1 WHERE username = ?',
          [username],
          function(err) {
            if (err) {
              console.error('❌ Error promoting user to admin:', err.message);
              reject(err);
            } else {
              if (this.changes > 0) {
                console.log(`✅ User '${username}' promoted to admin`);
                resolve(true);
              } else {
                console.log(`❌ User '${username}' not found`);
                resolve(false);
              }
            }
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Error promoting user to admin:', err.message);
    throw err;
  }
}

async function demoteFromAdmin(username) {
  const db = getDb();
  const dbConfig = getDbConfig();

  try {
    if (dbConfig.type === 'mysql') {
      const [result] = await db.execute(
        'UPDATE users SET is_admin = 0 WHERE username = ?',
        [username]
      );
      if (result.affectedRows > 0) {
        console.log(`✅ User '${username}' demoted from admin`);
        return true;
      } else {
        console.log(`❌ User '${username}' not found`);
        return false;
      }
    } else {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET is_admin = 0 WHERE username = ?',
          [username],
          function(err) {
            if (err) {
              console.error('❌ Error demoting user from admin:', err.message);
              reject(err);
            } else {
              if (this.changes > 0) {
                console.log(`✅ User '${username}' demoted from admin`);
                resolve(true);
              } else {
                console.log(`❌ User '${username}' not found`);
                resolve(false);
              }
            }
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Error demoting user from admin:', err.message);
    throw err;
  }
}

async function listAdminUsers() {
  const db = getDb();
  const dbConfig = getDbConfig();

  try {
    if (dbConfig.type === 'mysql') {
      const [rows] = await db.execute(
        'SELECT username, profile_picture, is_admin FROM users WHERE is_admin = 1'
      );
      return rows;
    } else {
      return new Promise((resolve, reject) => {
        db.all(
          'SELECT username, profile_picture, is_admin FROM users WHERE is_admin = 1',
          (err, rows) => {
            if (err) {
              console.error('❌ Error listing admin users:', err.message);
              reject(err);
            } else {
              resolve(rows);
            }
          }
        );
      });
    }
  } catch (err) {
    console.error('❌ Error listing admin users:', err.message);
    throw err;
  }
}

module.exports = {
  createAdminUser,
  promoteToAdmin,
  demoteFromAdmin,
  listAdminUsers
}; 