# Session-Based Security System

## Overview

The Audara Server now implements a secure session-based authentication system that links WebSocket connections to authenticated users. This prevents unauthorized access to admin functions by validating that the WebSocket connection belongs to an authenticated admin user.

## How It Works

### 1. Session Storage
- **Global Session Map**: `authenticatedSessions` stores active user sessions
- **WebSocket Linking**: Each WebSocket connection is linked to an authenticated user
- **Session Data**: Stores username, admin status, and session key

### 2. Authentication Flow
1. **Connection**: User connects via WebSocket
2. **Login**: User sends login credentials
3. **Validation**: Server validates credentials against database
4. **Session Creation**: If valid, creates authenticated session linked to WebSocket
5. **Admin Functions**: All admin functions now validate against the session

### 3. Security Benefits

#### Before (Insecure)
```javascript
// Client could send any username
{
  "action": "admin_stats",
  "username": "fake_admin" // ❌ Trusted without validation
}
```

#### After (Secure)
```javascript
// Server validates against authenticated session
const session = getAuthenticatedUser(ws);
if (!session || !session.isAdmin) {
  // ❌ Rejected - not authenticated or not admin
}
```

## Implementation Details

### Session Storage Structure
```javascript
authenticatedSessions = Map<WebSocket, {
  username: string,
  isAdmin: boolean,
  sessionKey: Buffer
}>
```

### Helper Functions
- `getAuthenticatedUser(ws)` - Get user session from WebSocket
- `isAuthenticated(ws)` - Check if WebSocket has authenticated session
- `isAuthenticatedAdmin(ws)` - Check if authenticated user is admin

### Admin Handler Changes
All admin handlers now:
1. **Check Authentication**: Verify user is logged in
2. **Check Admin Status**: Verify user has admin privileges
3. **Use Session Data**: No longer trust username parameters

## API Changes

### Removed Parameters
Admin handlers no longer require `username` parameter since they use the authenticated session:

#### Before
```json
{
  "action": "admin_stats",
  "username": "admin_user"
}
```

#### After
```json
{
  "action": "admin_stats"
}
```

### Error Messages
- `"Not authenticated. Please login first."` - User not logged in
- `"Unauthorized access. Admin privileges required."` - User not admin

## Security Features

### 1. Session Validation
- Every admin request validates against the authenticated session
- No database queries for admin status on each request
- Prevents username spoofing

### 2. Automatic Cleanup
- Sessions are automatically removed when WebSocket disconnects
- Prevents session hijacking from disconnected clients

### 3. Real-time Validation
- Admin status is checked in real-time from the session
- Changes to admin status require re-login to take effect

## Usage Example

### Client Flow
```javascript
// 1. Connect to WebSocket
const ws = new WebSocket('ws://localhost:3003');

// 2. Login (creates authenticated session)
ws.send(JSON.stringify({
  action: 'login',
  username: 'admin_user',
  password: 'password123'
}));

// 3. Use admin functions (no username needed)
ws.send(JSON.stringify({
  action: 'admin_stats'
}));

ws.send(JSON.stringify({
  action: 'ban_user',
  targetUsername: 'problematic_user'
}));
```

### Server Validation
```javascript
// Each admin handler now validates like this:
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

  // Proceed with admin function...
}
```

## Migration Notes

### For Existing Clients
- Remove `username` parameter from admin requests
- Ensure proper login flow before admin operations
- Handle new error messages for authentication failures

### Backward Compatibility
- Legacy `checkUserAdmin()` function still available for other uses
- Login handler unchanged for existing clients
- Only admin handlers require session validation

## Security Best Practices

1. **Always Login First**: Ensure users authenticate before admin operations
2. **Handle Disconnections**: Re-authenticate if WebSocket reconnects
3. **Monitor Sessions**: Log session creation/cleanup for security auditing
4. **Regular Validation**: Consider periodic session re-validation for long-running connections 