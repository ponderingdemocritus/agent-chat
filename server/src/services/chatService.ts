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

    if (error) console.error("Error upserting user:", error);
  },

  async setUserOffline(userId: string): Promise<void> {
    const { error } = await supabase
      .from("users")
      .update({
        is_online: false,
        last_seen: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) console.error("Error setting user offline:", error);
  },

  async getOnlineUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from("users")
      .select("id, username")
      .eq("is_online", true);

    if (error) {
      console.error("Error fetching online users:", error);
      return [];
    }

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
      console.error("Error saving direct message:", error);
      return null;
    }

    return data;
  },

  async getDirectMessageHistory(
    userId1: string,
    userId2: string,
    limit: number = 50
  ): Promise<Message[]> {
    console.log(
      `Fetching direct message history between ${userId1} and ${userId2}`
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
      console.error(
        "Error fetching direct message history (approach 1):",
        error1
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
        console.error(
          "Error fetching direct message history (approach 2):",
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

      console.log(`Found ${formattedData.length} messages using approach 2`);
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

    console.log(`Found ${formattedData.length} messages using approach 1`);
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
      console.error("Error saving global message:", error);
      return null;
    }

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
      console.error("Error fetching global chat history:", error);
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
      console.error("Error saving room message:", error);
      return null;
    }

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
      console.error("Error fetching room message history:", error);
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

    return formattedData;
  },

  // Debug functions
  async debugGetAllMessages(): Promise<Message[]> {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching all messages:", error);
      return [];
    }

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

    return { direct, global, rooms };
  },
};
