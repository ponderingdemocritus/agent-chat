// Blocklist configuration
// This file contains user IDs that are blocked from sending messages

export const BLOCKED_USER_IDS = new Set([
  "1438210365", // Blocked for hacking/abuse
]);

// Helper function to check if a user is blocked
export function isUserBlocked(userId: string): boolean {
  return BLOCKED_USER_IDS.has(userId);
}

// Helper function to add a user to the blocklist
export function blockUser(userId: string, reason?: string): void {
  BLOCKED_USER_IDS.add(userId);
  console.log(
    `[BLOCKLIST] User ${userId} has been blocked. Reason: ${
      reason || "No reason provided"
    }`
  );
}

// Helper function to unblock a user
export function unblockUser(userId: string): void {
  if (BLOCKED_USER_IDS.delete(userId)) {
    console.log(`[BLOCKLIST] User ${userId} has been unblocked.`);
  }
}

// Helper function to get all blocked users
export function getBlockedUsers(): string[] {
  return Array.from(BLOCKED_USER_IDS);
}
