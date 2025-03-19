import { io, Socket } from "socket.io-client";

class ChatClient {
  socket: Socket; // Changed to public for direct access from App component

  constructor(token: string, username?: string) {
    // Configure socket.io with better reconnection settings
    this.socket = io(import.meta.env.VITE_PUBLIC_CHAT_URL, {
      auth: {
        token,
        username,
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      // Don't automatically connect until the client is ready to handle events
      autoConnect: false,
    });

    // Set up all listeners first
    this.setupListeners();

    // Then connect to server
    this.socket.connect();

    console.log("ChatClient initialized, connecting to server...");
  }

  private setupListeners() {
    // Connection events
    this.socket.on("connect", () => {
      console.log("Socket.io connected successfully with ID:", this.socket.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Socket.io disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("Socket.io connection error:", error);
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log(`Socket.io reconnected after ${attemptNumber} attempts`);
      // Request updated data after reconnection
      this.getAllUsers();
      this.getRooms();
    });

    // Message events
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

  // Add method to request all users (both online and offline)
  getAllUsers() {
    this.socket.emit("getAllUsers");
  }

  // Add method to get available rooms
  getRooms() {
    this.socket.emit("getRooms");
  }

  // Add method to get direct message history
  getDirectMessageHistory(otherUserId: string) {
    console.log(`Requesting direct message history with ${otherUserId}`);
    this.socket.emit("getDirectMessageHistory", { otherUserId });
  }

  // Add method to get room history
  getRoomHistory(roomId: string) {
    console.log(`Requesting room history for ${roomId}`);
    this.socket.emit("getRoomHistory", { roomId });
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
