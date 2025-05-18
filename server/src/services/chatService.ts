import { supabase } from "../config/supabase";

// Types for our database models
export interface Message {
  id?: string;
  sender_id: string;
  recipient_id?: string;
  room_id?: string;
  message: string;
  created_at?: string;
}

export interface User {
  id: string;
  username?: string;
  last_seen?: string;
  is_online?: boolean;
}

// Simple logging utility
const logger = {
  debug: (context: string, message: string) => {
    if (process.env.DEBUG === "true") {
      console.log(`[DEBUG][${context}] ${message}`);
    }
  },
  info: (context: string, message: string) => {
    console.log(`[INFO][${context}] ${message}`);
  },
  error: (context: string, message: string, error?: any) => {
    console.error(`[ERROR][${context}] ${message}`, error || "");
  },
};

// Chat service for database operations
export const chatService = {
  // User operations
  async upsertUser(
    userId: string,
    isOnline: boolean = true,
    username?: string
  ): Promise<void> {
    const userData: any = {
      id: userId,
      is_online: isOnline,
      last_seen: new Date().toISOString(),
    };

    // Only add username if provided
    if (username) {
      userData.username = username;
    }

    const { error } = await supabase.from("users").upsert(userData);

    if (error) {
      logger.error("upsertUser", `Failed to upsert user ${userId}`, error);
    } else {
      logger.debug("upsertUser", `User ${userId} upserted successfully`);
    }
  },

  async getUserById(userId: string): Promise<User | null> {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, is_online, last_seen")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // PGRST116: "The result contains 0 rows"
        logger.debug("getUserById", `User ${userId} not found.`);
        return null;
      }
      logger.error("getUserById", `Failed to fetch user ${userId}`, error);
      return null;
    }
    logger.debug(
      "getUserById",
      `Fetched user ${userId}: ${JSON.stringify(data)}`
    );
    return data;
  },

  async setUserOffline(userId: string): Promise<void> {
    const { error } = await supabase
      .from("users")
      .update({
        is_online: false,
        last_seen: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      logger.error(
        "setUserOffline",
        `Failed to set user ${userId} offline`,
        error
      );
    } else {
      logger.debug("setUserOffline", `User ${userId} set offline`);
    }
  },

  async getOnlineUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from("users")
      .select("id, username")
      .eq("is_online", true);

    if (error) {
      logger.error("getOnlineUsers", "Failed to fetch online users", error);
      return [];
    }

    // Ensure usernames are set
    const users = (data || []).map((user) => ({
      id: user.id,
      username: user.username || user.id,
    }));

    logger.debug("getOnlineUsers", `Found ${users.length} online users`);
    return users;
  },

  // New method to get all users (both online and offline)
  async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, is_online, last_seen");

    if (error) {
      logger.error("getAllUsers", "Failed to fetch all users", error);
      return [];
    }

    logger.debug("getAllUsers", `Retrieved ${data?.length || 0} users`);
    return data || [];
  },

  // Direct message operations
  async saveDirectMessage(
    senderId: string,
    recipientId: string,
    message: string
  ): Promise<Message | null> {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: senderId,
        recipient_id: recipientId,
        message,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error(
        "saveDirectMessage",
        `Failed to save direct message from ${senderId} to ${recipientId}`,
        error
      );
      return null;
    }

    logger.debug("saveDirectMessage", `Message saved with ID: ${data.id}`);
    return data;
  },

  async getDirectMessageHistory(
    userId1: string,
    userId2: string,
    limit: number = 50
  ): Promise<Message[]> {
    logger.debug(
      "getDirectMessageHistory",
      `Fetching history between ${userId1} and ${userId2}`
    );

    // First approach: Using OR with AND conditions
    const { data: data1, error: error1 } = await supabase
      .from("messages")
      .select("*, users!messages_sender_id_fkey(username)")
      .or(
        `and(sender_id.eq.${userId1},recipient_id.eq.${userId2}),and(sender_id.eq.${userId2},recipient_id.eq.${userId1})`
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error1) {
      logger.debug(
        "getDirectMessageHistory",
        `Primary query failed, trying fallback`
      );

      // Try second approach if first fails
      const { data: data2, error: error2 } = await supabase
        .from("messages")
        .select("*, users!messages_sender_id_fkey(username)")
        .or(`sender_id.eq.${userId1},sender_id.eq.${userId2}`)
        .or(`recipient_id.eq.${userId1},recipient_id.eq.${userId2}`)
        .is("room_id", null)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error2) {
        logger.error(
          "getDirectMessageHistory",
          `Both queries failed for users ${userId1} and ${userId2}`,
          error2
        );
        return [];
      }

      // Filter to only include messages between these two users
      const filteredData =
        data2?.filter(
          (msg) =>
            (msg.sender_id === userId1 && msg.recipient_id === userId2) ||
            (msg.sender_id === userId2 && msg.recipient_id === userId1)
        ) || [];

      // Format the data to include username
      const formattedData = filteredData.map((msg) => {
        const userData = msg.users as { username: string } | null;
        return {
          ...msg,
          username: userData?.username || msg.sender_id,
        };
      });

      logger.debug(
        "getDirectMessageHistory",
        `Found ${formattedData.length} messages using fallback approach`
      );
      return formattedData;
    }

    // Format the data to include username
    const formattedData =
      data1?.map((msg) => {
        const userData = msg.users as { username: string } | null;
        return {
          ...msg,
          username: userData?.username || msg.sender_id,
        };
      }) || [];

    logger.debug(
      "getDirectMessageHistory",
      `Found ${formattedData.length} messages using primary approach`
    );
    return formattedData;
  },

  // Global chat operations
  async saveGlobalMessage(
    senderId: string,
    message: string
  ): Promise<Message | null> {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: senderId,
        room_id: "global",
        message,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error(
        "saveGlobalMessage",
        `Failed to save global message from ${senderId}`,
        error
      );
      return null;
    }

    logger.debug(
      "saveGlobalMessage",
      `Global message saved with ID: ${data.id}`
    );
    return data;
  },

  async getGlobalChatHistory(limit: number = 100): Promise<Message[]> {
    const { data, error } = await supabase
      .from("messages")
      .select("*, users!messages_sender_id_fkey(username)")
      .eq("room_id", "global")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(
        "getGlobalChatHistory",
        "Failed to fetch global chat history",
        error
      );
      return [];
    }

    // Format the data to include username
    const formattedData =
      data?.map((msg) => {
        const userData = msg.users as { username: string } | null;
        return {
          ...msg,
          username: userData?.username || msg.sender_id,
        };
      }) || [];

    logger.debug(
      "getGlobalChatHistory",
      `Retrieved ${formattedData.length} global messages`
    );
    return formattedData;
  },

  // Room message operations
  async saveRoomMessage(
    senderId: string,
    roomId: string,
    message: string
  ): Promise<Message | null> {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: senderId,
        room_id: roomId,
        message,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error(
        "saveRoomMessage",
        `Failed to save message to room ${roomId}`,
        error
      );
      return null;
    }

    logger.debug(
      "saveRoomMessage",
      `Message saved to room ${roomId} with ID: ${data.id}`
    );
    return data;
  },

  async getRoomMessageHistory(
    roomId: string,
    limit: number = 100
  ): Promise<Message[]> {
    const { data, error } = await supabase
      .from("messages")
      .select("*, users!messages_sender_id_fkey(username)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(
        "getRoomMessageHistory",
        `Failed to fetch messages for room ${roomId}`,
        error
      );
      return [];
    }

    // Format the data to include username
    const formattedData =
      data?.map((msg) => {
        const userData = msg.users as { username: string } | null;
        return {
          ...msg,
          username: userData?.username || msg.sender_id,
        };
      }) || [];

    logger.debug(
      "getRoomMessageHistory",
      `Retrieved ${formattedData.length} messages for room ${roomId}`
    );
    return formattedData;
  },

  // Get available rooms
  async getAvailableRooms(): Promise<any[]> {
    logger.debug("getAvailableRooms", "Fetching available rooms");

    // First approach: Get all distinct room_ids
    const { data: roomData, error: roomError } = await supabase
      .from("messages")
      .select("room_id")
      .not("room_id", "is", null);

    if (roomError) {
      logger.error(
        "getAvailableRooms",
        "Failed to fetch available rooms",
        roomError
      );
      return [];
    }

    // Extract unique room IDs and ensure they're treated as strings
    const uniqueRoomIds = [
      ...new Set(roomData.map((item) => String(item.room_id))),
    ];

    // For now, we'll return a simple array of room objects
    // In a real app, you would query a rooms table with more details
    const rooms = uniqueRoomIds.map((roomId) => ({
      id: roomId,
      name: roomId === "global" ? "Global Chat" : roomId,
    }));

    logger.debug("getAvailableRooms", `Found ${rooms.length} available rooms`);
    return rooms;
  },

  // Debug functions
  async debugGetAllMessages(): Promise<Message[]> {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      logger.error(
        "debugGetAllMessages",
        "Failed to fetch messages for debugging",
        error
      );
      return [];
    }

    logger.debug(
      "debugGetAllMessages",
      `Retrieved ${data?.length || 0} messages for debugging`
    );
    return data || [];
  },

  async debugGetMessagesByType(): Promise<{
    direct: number;
    global: number;
    rooms: number;
  }> {
    const allMessages = await this.debugGetAllMessages();

    const direct = allMessages.filter(
      (msg) => msg.recipient_id && !msg.room_id
    ).length;
    const global = allMessages.filter((msg) => msg.room_id === "global").length;
    const rooms = allMessages.filter(
      (msg) => msg.room_id && msg.room_id !== "global"
    ).length;

    logger.debug(
      "debugGetMessagesByType",
      `Message counts - Direct: ${direct}, Global: ${global}, Rooms: ${rooms}`
    );
    return { direct, global, rooms };
  },
};
