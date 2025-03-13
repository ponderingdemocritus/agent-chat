import { io, Socket } from "socket.io-client";

class ChatClient {
  socket: Socket; // Changed to public for direct access from App component

  constructor(token: string, username?: string) {
    this.socket = io("http://localhost:3000", {
      auth: {
        token,
        username,
      },
    });
    this.setupListeners();

    // Request online users list when connected
    this.socket.on("connect", () => {
      console.log("Connected to server, requesting online users");
      this.getOnlineUsers();
    });
  }

  private setupListeners() {
    this.socket.on("directMessage", ({ senderId, recipientId, message }) => {
      console.log(`DM from ${senderId} to ${recipientId || "me"}: ${message}`);
      // Update UI
    });
    this.socket.on("roomMessage", ({ senderId, message }) => {
      console.log(`Room message from ${senderId}: ${message}`);
      // Update UI
    });
    this.socket.on("globalMessage", ({ senderId, message }) => {
      console.log(`Global message from ${senderId}: ${message}`);
      // Update UI
    });

    // Add listeners for online users
    this.socket.on("onlineUsers", (users) => {
      console.log("Online users updated:", users);
      // Update UI will be handled by the component
    });

    this.socket.on("userOffline", ({ userId }) => {
      console.log(`User went offline: ${userId}`);
      // Update UI will be handled by the component
    });
  }

  sendDirectMessage(recipientId: string, message: string) {
    console.log(`Sending DM to ${recipientId}: ${message}`);
    this.socket.emit("directMessage", { recipientId, message });
  }

  joinRoom(roomId: string) {
    this.socket.emit("joinRoom", { roomId });
  }

  sendRoomMessage(roomId: string, message: string) {
    this.socket.emit("roomMessage", { roomId, message });
  }

  sendGlobalMessage(message: string) {
    this.socket.emit("globalMessage", { message });
  }

  // Add method to request online users
  getOnlineUsers() {
    this.socket.emit("getOnlineUsers");
  }

  // Add method to get direct message history
  getDirectMessageHistory(otherUserId: string) {
    console.log(`Requesting direct message history with ${otherUserId}`);
    this.socket.emit("getDirectMessageHistory", { otherUserId });
  }

  // Debug method to check message counts and direct messages
  debug(type: string, params: any = {}) {
    console.log(`Sending debug request: ${type}`, params);
    this.socket.emit("debug", { type, ...params });

    // Set up a one-time listener for the debug result
    this.socket.once("debugResult", (result) => {
      console.log("Debug result:", result);
    });
  }
}

export default ChatClient;
