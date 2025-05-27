# Blocklist Feature Documentation

## Overview

The blocklist feature prevents specific users from sending messages in the chat application. Blocked users can still connect and view messages, but cannot send any messages (direct, global, or room messages).

## Implementation Details

### Blocked User: 1438210365

- **Reason**: Hacking/abuse of the service
- **Date Added**: [Current Date]

### How It Works

1. **Blocklist Configuration** (`server/src/config/blocklist.ts`)

   - Maintains a Set of blocked user IDs
   - Provides helper functions for blocklist management

2. **Message Blocking** (`server/src/services/chatService.ts`)

   - All message-saving methods check the blocklist before saving
   - Blocked messages are logged but not saved to the database

3. **Socket Handling** (`server/src/index.ts`)

   - Blocked users receive error messages when attempting to send messages
   - Blocked users are disconnected if they try to connect
   - Error type "blocked" is sent to the client

4. **Admin Endpoints**
   - `POST /admin/block/:userId` - Block a user with optional reason
   - `DELETE /admin/block/:userId` - Unblock a user
   - `GET /admin/blocklist` - Get list of all blocked users
   - `GET /health` - Health check includes blocked users count

## Usage

### Command Line Management

```bash
# Block a user
npm run blocklist block <userId> [reason]

# Unblock a user
npm run blocklist unblock <userId>

# List all blocked users
npm run blocklist list
```

### HTTP API Management

```bash
# Block a user
curl -X POST http://localhost:3000/admin/block/1438210365 \
  -H "Content-Type: application/json" \
  -d '{"reason": "Hacking attempt"}'

# Unblock a user
curl -X DELETE http://localhost:3000/admin/block/1438210365

# Get blocklist
curl http://localhost:3000/admin/blocklist
```

## Security Considerations

1. **Admin Endpoints**: In production, these endpoints should be protected with authentication
2. **Persistence**: Currently, the blocklist is in-memory. For production, consider:
   - Storing in database
   - Redis for distributed systems
   - File-based storage with periodic saves

## Client-Side Handling

Clients should handle the "blocked" error type appropriately:

```javascript
socket.on("error", (error) => {
  if (error.type === "blocked") {
    // Show user they are blocked
    alert("You are blocked from sending messages");
  }
});
```

## Future Enhancements

1. **Temporary Blocks**: Add expiration times for blocks
2. **Block Reasons**: Store and display block reasons
3. **IP Blocking**: Block by IP address in addition to user ID
4. **Rate Limiting**: Implement rate limiting to prevent spam
5. **Audit Log**: Log all block/unblock actions with timestamps
6. **Database Storage**: Move blocklist to database for persistence
