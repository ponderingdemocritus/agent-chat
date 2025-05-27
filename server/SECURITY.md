# Security Features Documentation

## Overview

This chat service implements multiple security features to prevent abuse and maintain service quality:

1. **Blocklist** - Permanently blocks specific users from sending messages
2. **Rate Limiting** - Prevents users from spamming by limiting message frequency

## 1. Blocklist Feature

### Currently Blocked Users

- **1438210365** - Blocked for hacking/abuse of the service

### How Blocklist Works

- Blocked users cannot send any messages (direct, global, or room)
- Blocked users are disconnected when they try to connect
- All block attempts are logged for monitoring

### Blocklist Management

#### Command Line

```bash
# Block a user
npm run blocklist block <userId> [reason]

# Unblock a user
npm run blocklist unblock <userId>

# List all blocked users
npm run blocklist list
```

#### HTTP API

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

## 2. Rate Limiting Feature

### Rate Limits by Message Type

| Message Type    | Limit       | Time Window | Cooldown Period |
| --------------- | ----------- | ----------- | --------------- |
| Direct Messages | 30 messages | 1 minute    | 5 minutes       |
| Global Messages | 10 messages | 1 minute    | 10 minutes      |
| Room Messages   | 20 messages | 1 minute    | 5 minutes       |

### How Rate Limiting Works

1. Each user has separate counters for each message type
2. Counters reset after the time window expires
3. When limit is exceeded, user is blocked for the cooldown period
4. Users receive clear error messages with retry times

### Rate Limit Management

#### Command Line

```bash
# List all rate limited users
npm run ratelimits list

# Check rate limit status for a user
npm run ratelimits status <userId>

# Clear rate limits for a user (all types)
npm run ratelimits clear <userId>

# Clear specific message type rate limit
npm run ratelimits clear <userId> direct
npm run ratelimits clear <userId> global
npm run ratelimits clear <userId> room
```

#### HTTP API

```bash
# Get all rate limited users
curl http://localhost:3000/admin/ratelimits

# Get rate limit status for a user
curl http://localhost:3000/admin/ratelimits/userId123

# Clear all rate limits for a user
curl -X DELETE http://localhost:3000/admin/ratelimits/userId123

# Clear specific message type rate limit
curl -X DELETE http://localhost:3000/admin/ratelimits/userId123?messageType=direct
```

## Client-Side Error Handling

### Error Types

```javascript
socket.on("error", (error) => {
  switch (error.type) {
    case "blocked":
      // User is permanently blocked
      alert("You are blocked from sending messages");
      break;

    case "rate_limited":
      // User hit rate limit
      alert(`Rate limit exceeded. Please wait ${error.retryAfter} seconds.`);
      break;

    case "message_failed":
      // Generic message failure
      alert("Failed to send message");
      break;
  }
});
```

### Getting Rate Limit Status

```javascript
// Request current rate limit status
socket.emit("getRateLimitStatus");

// Listen for rate limit status
socket.on("rateLimitStatus", (status) => {
  console.log("Direct messages:", status.direct);
  console.log("Global messages:", status.global);
  console.log("Room messages:", status.room);
});
```

## Security Best Practices

### For Production Deployment

1. **Authentication**: Protect admin endpoints with proper authentication
2. **HTTPS**: Use HTTPS for all API endpoints
3. **Persistence**: Store blocklist and rate limits in database/Redis
4. **Monitoring**: Set up alerts for:
   - Users hitting rate limits frequently
   - Blocked users attempting to connect
   - Unusual message patterns

### Configuration Recommendations

1. Adjust rate limits based on your user base and usage patterns
2. Consider implementing progressive rate limiting (stricter limits for repeat offenders)
3. Add IP-based blocking for severe cases
4. Implement CAPTCHA for users who frequently hit rate limits

## Monitoring and Analytics

### Health Check Endpoint

```bash
curl http://localhost:3000/health
```

Returns:

```json
{
  "status": "ok",
  "blockedUsersCount": 1,
  "rateLimitedUsersCount": 3
}
```

### Logs to Monitor

- `[BLOCKLIST]` - Block/unblock actions
- `[RATE_LIMITER]` - Rate limit actions
- `Blocked user X attempted to...` - Block violations
- `User X hit rate limit for...` - Rate limit violations

## Future Enhancements

1. **Temporary Blocks**: Add time-based blocks with automatic expiration
2. **IP Blocking**: Block by IP address in addition to user ID
3. **Progressive Rate Limiting**: Stricter limits for repeat offenders
4. **Reputation System**: Track user behavior over time
5. **Machine Learning**: Detect spam patterns automatically
6. **Webhook Notifications**: Alert admins of security events
7. **Audit Trail**: Complete history of all security actions
