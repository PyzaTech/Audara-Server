const { encryptMessage } = require('../utils/crypto');
const { validateLogin } = require('../database/dbManager');

function handleLogin(message, ws, key) {
  const { username, password } = message;

  if (!username || !password) {
    ws.send(encryptMessage(JSON.stringify({ success: false, error: 'Missing username or password' }), key));
    return;
  }

  validateLogin(username, password).then(user => {
    if (user) {
      // Store authenticated session
      const { authenticatedSessions } = require('../websocketconnectionHandler');
      authenticatedSessions.set(ws, {
        username: user.username,
        isAdmin: user.is_admin === 1 || user.is_admin === true,
        sessionKey: key
      });

      ws.send(
        encryptMessage(
          JSON.stringify({
            action: "login",
            success: true,
            message: 'Login successful',
            username: user.username,
            profilePictureUrl: user.profile_picture,
            isAdmin: user.is_admin === 1 || user.is_admin === true,
          }),
          key
        )
      );
    } else {
      ws.send(encryptMessage(JSON.stringify({ action: "login", success: false, error: 'Invalid credentials' }), key));
    }
  });
}

module.exports = { handleLogin }; 