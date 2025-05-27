#!/usr/bin/env node

import axios from "axios";

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";

async function blockUser(userId: string, reason?: string) {
  try {
    const response = await axios.post(`${SERVER_URL}/admin/block/${userId}`, {
      reason: reason || "No reason provided",
    });
    console.log(`✅ ${response.data.message}`);
  } catch (error) {
    console.error(`❌ Failed to block user ${userId}:`, error.message);
  }
}

async function unblockUser(userId: string) {
  try {
    const response = await axios.delete(`${SERVER_URL}/admin/block/${userId}`);
    console.log(`✅ ${response.data.message}`);
  } catch (error) {
    console.error(`❌ Failed to unblock user ${userId}:`, error.message);
  }
}

async function listBlockedUsers() {
  try {
    const response = await axios.get(`${SERVER_URL}/admin/blocklist`);
    const { blockedUsers } = response.data;

    if (blockedUsers.length === 0) {
      console.log("No users are currently blocked.");
    } else {
      console.log("Blocked users:");
      blockedUsers.forEach((userId: string) => {
        console.log(`  - ${userId}`);
      });
    }
  } catch (error) {
    console.error("❌ Failed to fetch blocklist:", error.message);
  }
}

// Parse command line arguments
const command = process.argv[2];
const userId = process.argv[3];
const reason = process.argv[4];

switch (command) {
  case "block":
    if (!userId) {
      console.error("Usage: npm run blocklist block <userId> [reason]");
      process.exit(1);
    }
    blockUser(userId, reason);
    break;

  case "unblock":
    if (!userId) {
      console.error("Usage: npm run blocklist unblock <userId>");
      process.exit(1);
    }
    unblockUser(userId);
    break;

  case "list":
    listBlockedUsers();
    break;

  default:
    console.log("Blocklist Management Tool");
    console.log("");
    console.log("Usage:");
    console.log("  npm run blocklist block <userId> [reason]   - Block a user");
    console.log(
      "  npm run blocklist unblock <userId>          - Unblock a user"
    );
    console.log(
      "  npm run blocklist list                      - List all blocked users"
    );
    console.log("");
    console.log("Environment variables:");
    console.log("  SERVER_URL - Server URL (default: http://localhost:3000)");
}
