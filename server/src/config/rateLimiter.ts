// Rate limiter configuration
// Prevents users from sending too many messages in a short time period

interface RateLimitConfig {
  maxMessages: number;
  windowMs: number; // Time window in milliseconds
  blockDurationMs?: number; // How long to block after hitting limit
}

// Different rate limits for different message types
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  direct: {
    maxMessages: 15,
    windowMs: 60 * 1000, // 30 messages per minute
    blockDurationMs: 5 * 60 * 1000, // 5 minute cooldown
  },
  global: {
    maxMessages: 10,
    windowMs: 60 * 1000, // 10 messages per minute (stricter for global)
    blockDurationMs: 10 * 60 * 1000, // 10 minute cooldown
  },
  room: {
    maxMessages: 20,
    windowMs: 60 * 1000, // 20 messages per minute
    blockDurationMs: 5 * 60 * 1000, // 5 minute cooldown
  },
};

// Store message counts per user
interface UserMessageCount {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

const userMessageCounts = new Map<string, Map<string, UserMessageCount>>();

// Check if user is rate limited
export function isRateLimited(
  userId: string,
  messageType: "direct" | "global" | "room"
): { limited: boolean; retryAfter?: number } {
  const limit = RATE_LIMITS[messageType];
  const now = Date.now();

  // Get or create user's rate limit data
  if (!userMessageCounts.has(userId)) {
    userMessageCounts.set(userId, new Map());
  }
  const userCounts = userMessageCounts.get(userId)!;

  // Get or create count for this message type
  let countData = userCounts.get(messageType);
  if (!countData) {
    countData = {
      count: 0,
      windowStart: now,
    };
    userCounts.set(messageType, countData);
  }

  // Check if user is currently blocked
  if (countData.blockedUntil && now < countData.blockedUntil) {
    return {
      limited: true,
      retryAfter: Math.ceil((countData.blockedUntil - now) / 1000), // seconds
    };
  }

  // Reset window if expired
  if (now - countData.windowStart > limit.windowMs) {
    countData.count = 0;
    countData.windowStart = now;
    countData.blockedUntil = undefined;
  }

  // Check if limit exceeded
  if (countData.count >= limit.maxMessages) {
    // Apply block duration
    if (limit.blockDurationMs) {
      countData.blockedUntil = now + limit.blockDurationMs;
    }
    return {
      limited: true,
      retryAfter: Math.ceil(limit.blockDurationMs! / 1000), // seconds
    };
  }

  return { limited: false };
}

// Increment message count for user
export function incrementMessageCount(
  userId: string,
  messageType: "direct" | "global" | "room"
): void {
  const userCounts = userMessageCounts.get(userId);
  if (!userCounts) return;

  const countData = userCounts.get(messageType);
  if (countData) {
    countData.count++;
  }
}

// Get current rate limit status for a user
export function getRateLimitStatus(userId: string): Record<string, any> {
  const userCounts = userMessageCounts.get(userId);
  if (!userCounts) {
    return {
      direct: { count: 0, limit: RATE_LIMITS.direct.maxMessages },
      global: { count: 0, limit: RATE_LIMITS.global.maxMessages },
      room: { count: 0, limit: RATE_LIMITS.room.maxMessages },
    };
  }

  const status: Record<string, any> = {};
  const now = Date.now();

  for (const [messageType, limit] of Object.entries(RATE_LIMITS)) {
    const countData = userCounts.get(messageType);
    if (!countData || now - countData.windowStart > limit.windowMs) {
      status[messageType] = {
        count: 0,
        limit: limit.maxMessages,
        windowRemaining: limit.windowMs / 1000, // seconds
      };
    } else {
      status[messageType] = {
        count: countData.count,
        limit: limit.maxMessages,
        windowRemaining: Math.ceil(
          (limit.windowMs - (now - countData.windowStart)) / 1000
        ),
        blockedUntil: countData.blockedUntil
          ? new Date(countData.blockedUntil).toISOString()
          : undefined,
      };
    }
  }

  return status;
}

// Clear rate limit data for a user (admin function)
export function clearRateLimit(userId: string, messageType?: string): void {
  if (!messageType) {
    // Clear all rate limits for user
    userMessageCounts.delete(userId);
    console.log(`[RATE_LIMITER] Cleared all rate limits for user ${userId}`);
  } else {
    // Clear specific message type
    const userCounts = userMessageCounts.get(userId);
    if (userCounts) {
      userCounts.delete(messageType);
      console.log(
        `[RATE_LIMITER] Cleared ${messageType} rate limit for user ${userId}`
      );
    }
  }
}

// Get all users currently rate limited
export function getRateLimitedUsers(): string[] {
  const rateLimited: string[] = [];
  const now = Date.now();

  userMessageCounts.forEach((userCounts, userId) => {
    let isLimited = false;
    userCounts.forEach((countData) => {
      if (countData.blockedUntil && now < countData.blockedUntil) {
        isLimited = true;
      }
    });
    if (isLimited) {
      rateLimited.push(userId);
    }
  });

  return rateLimited;
}
