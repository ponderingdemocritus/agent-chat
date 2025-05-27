#!/usr/bin/env node

import axios from "axios";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";

async function getRateLimitedUsers() {
  try {
    const response = await axios.get(`${SERVER_URL}/admin/ratelimits`);
    const { rateLimitedUsers } = response.data;

    if (rateLimitedUsers.length === 0) {
      console.log("No users are currently rate limited.");
    } else {
      console.log("Rate limited users:");
      rateLimitedUsers.forEach((userId: string) => {
        console.log(`  - ${userId}`);
      });
    }
  } catch (error) {
    console.error("❌ Failed to fetch rate limited users:", error.message);
  }
}

async function getUserRateLimitStatus(userId: string) {
  try {
    const response = await axios.get(
      `${SERVER_URL}/admin/ratelimits/${userId}`
    );
    const { status } = response.data;

    console.log(`Rate limit status for user ${userId}:`);
    console.log("");

    Object.entries(status).forEach(([messageType, info]: [string, any]) => {
      console.log(`${messageType.toUpperCase()}:`);
      console.log(`  Current: ${info.count}/${info.limit} messages`);
      console.log(`  Window remaining: ${info.windowRemaining}s`);
      if (info.blockedUntil) {
        console.log(`  ⚠️  BLOCKED until: ${info.blockedUntil}`);
      }
      console.log("");
    });
  } catch (error) {
    console.error(
      `❌ Failed to get rate limit status for user ${userId}:`,
      error.message
    );
  }
}

async function clearUserRateLimit(userId: string, messageType?: string) {
  try {
    const url = messageType
      ? `${SERVER_URL}/admin/ratelimits/${userId}?messageType=${messageType}`
      : `${SERVER_URL}/admin/ratelimits/${userId}`;

    const response = await axios.delete(url);
    console.log(`✅ ${response.data.message}`);
  } catch (error) {
    console.error(
      `❌ Failed to clear rate limit for user ${userId}:`,
      error.message
    );
  }
}

// Parse command line arguments
const command = process.argv[2];
const userId = process.argv[3];
const messageType = process.argv[4];

switch (command) {
  case "list":
    getRateLimitedUsers();
    break;

  case "status":
    if (!userId) {
      console.error("Usage: npm run ratelimits status <userId>");
      process.exit(1);
    }
    getUserRateLimitStatus(userId);
    break;

  case "clear":
    if (!userId) {
      console.error("Usage: npm run ratelimits clear <userId> [messageType]");
      process.exit(1);
    }
    clearUserRateLimit(userId, messageType);
    break;

  default:
    console.log("Rate Limit Management Tool");
    console.log("");
    console.log("Usage:");
    console.log(
      "  npm run ratelimits list                     - List all rate limited users"
    );
    console.log(
      "  npm run ratelimits status <userId>          - Get rate limit status for a user"
    );
    console.log(
      "  npm run ratelimits clear <userId> [type]    - Clear rate limits for a user"
    );
    console.log("");
    console.log("Message types: direct, global, room");
    console.log("");
    console.log("Environment variables:");
    console.log("  SERVER_URL - Server URL (default: http://localhost:3000)");
}
