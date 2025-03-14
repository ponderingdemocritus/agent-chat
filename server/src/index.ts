// src/server.ts
import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";
import { chatService } from "./services/chatService";

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// User and socket tracking
interface UserSocket {
  userId: string;
  socket: Socket;
}

// In-memory socket mappings (these still need to be in-memory)
const userSockets = new Map<string, Socket>(); // userId -> socket
const socketUsers = new Map<string, string>(); // socketId -> userId

// Mock functions for authentication
// In a real app, these would connect to your actual auth system
function isValidToken(token: string): boolean {
  console.log(`Validating token: ${token}`);
  // Mock implementation - replace with actual JWT verification
  return Boolean(token && token.length > 10);
}

function extractUserId(token: string): string {
  // Mock implementation - replace with actual JWT decoding
  return token.split("-")[0];
}

function findSocketByUserId(userId: string): Socket | undefined {
  return userSockets.get(userId);
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow connections from any origin
    methods: ["GET", "POST"],
    credentials: true,
  },
}); // Allow connections from Docker containers

// Authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const username = socket.handshake.auth.username;

  if (isValidToken(token)) {
    const userId = extractUserId(token);
    socket.data.userId = userId;
    socket.data.username = username || userId; // Use username if provided, otherwise use userId
    next();
  } else {
    next(new Error("Authentication error"));
  }
});

io.on("connection", async (socket) => {
  const userId = socket.data.userId;
  const username = socket.data.username;
  console.log(
    `User connected: ${socket.id} (User ID: ${userId}, Username: ${username})`
  );

  // Store socket mapping
  userSockets.set(userId, socket);
  socketUsers.set(socket.id, userId);

  // Update user status in database with username
  await chatService.upsertUser(userId, true, username);

  // Get online users from database and broadcast
  const onlineUsers = await chatService.getOnlineUsers();
  io.emit("onlineUsers", onlineUsers);

  // Join global chat automatically
  socket.join("global");

  // Get global chat history from database
  const globalHistory = await chatService.getGlobalChatHistory();
  socket.emit("globalHistory", globalHistory);

  // Debug event to check message counts
  socket.on("debug", async (data) => {
    try {
      console.log("Debug request received:", data);

      if (data.type === "messageCounts") {
        const counts = await chatService.debugGetMessagesByType();
        socket.emit("debugResult", { type: "messageCounts", counts });
      } else if (data.type === "directMessages" && data.otherUserId) {
        const messages = await chatService.getDirectMessageHistory(
          userId,
          data.otherUserId
        );
        socket.emit("debugResult", {
          type: "directMessages",
          otherUserId: data.otherUserId,
          count: messages.length,
          messages,
        });

        // Also log the SQL query parameters for debugging
        console.log(
          `Debug direct messages between ${userId} and ${data.otherUserId}`
        );
        console.log(`Found ${messages.length} messages`);
      }
    } catch (error) {
      console.error("Error in debug event:", error);
      socket.emit("debugResult", { error: "Debug operation failed" });
    }
  });

  // Handle direct messages
  socket.on("directMessage", async ({ recipientId, message }) => {
    const senderId = socket.data.userId;
    const senderUsername = socket.data.username;
    console.log(
      `User ${senderId} (${senderUsername}) sending direct message to ${recipientId}: ${message}`
    );

    try {
      // Save message to database
      const savedMessage = await chatService.saveDirectMessage(
        senderId,
        recipientId,
        message
      );

      if (savedMessage) {
        console.log(`Message saved to database with ID: ${savedMessage.id}`);
      } else {
        console.warn(`Failed to save message to database`);
      }

      // Forward to recipient if online
      const recipientSocket = findSocketByUserId(recipientId);
      if (recipientSocket) {
        console.log(`Recipient ${recipientId} is online, forwarding message`);
        recipientSocket.emit("directMessage", {
          senderId,
          senderUsername,
          recipientId,
          message,
          timestamp: new Date(),
        });
      } else {
        console.log(
          `Recipient ${recipientId} is offline, message stored for later delivery`
        );
      }

      // Confirm delivery to sender
      socket.emit("messageSent", { recipientId, message });
    } catch (error) {
      console.error("Error sending direct message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Handle direct message history request
  socket.on("getDirectMessageHistory", async ({ otherUserId }) => {
    console.log(
      `User ${userId} requested direct message history with ${otherUserId}`
    );

    try {
      const history = await chatService.getDirectMessageHistory(
        userId,
        otherUserId
      );

      console.log(
        `Found ${history.length} messages between ${userId} and ${otherUserId}`
      );

      socket.emit("directMessageHistory", { otherUserId, messages: history });
    } catch (error) {
      console.error("Error getting direct message history:", error);
      socket.emit("error", { message: "Failed to get message history" });
    }
  });

  // Handle room operations
  socket.on("joinRoom", ({ roomId }) => {
    socket.join(roomId);
    socket.emit("roomJoined", { roomId });
    io.to(roomId).emit("userJoined", { userId: socket.data.userId, roomId });
  });

  socket.on("roomMessage", async ({ roomId, message }) => {
    const senderId = socket.data.userId;
    const senderUsername = socket.data.username;

    // Save room message to database
    await chatService.saveRoomMessage(senderId, roomId, message);

    console.log(
      `Room message ${message} sent to room ${roomId} by ${senderId} (${senderUsername})`
    );

    io.to(roomId).emit("roomMessage", {
      senderId,
      senderUsername,
      roomId,
      message,
      timestamp: new Date(),
    });
  });

  socket.on("getRoomHistory", async ({ roomId }) => {
    const history = await chatService.getRoomMessageHistory(roomId);
    socket.emit("roomHistory", { roomId, messages: history });
  });

  socket.on("leaveRoom", ({ roomId }) => {
    socket.leave(roomId);
    io.to(roomId).emit("userLeft", { userId: socket.data.userId, roomId });
  });

  // Handle global chat
  socket.on("globalMessage", async ({ message }) => {
    const senderId = socket.data.userId;
    const senderUsername = socket.data.username;

    // Save global message to database
    await chatService.saveGlobalMessage(senderId, message);

    const messageData = {
      senderId,
      senderUsername,
      message,
      timestamp: new Date(),
    };

    io.to("global").emit("globalMessage", messageData);
  });

  // Handle request for online users
  socket.on("getOnlineUsers", async () => {
    console.log(`User ${userId} requested online users list`);
    const onlineUsers = await chatService.getOnlineUsers();
    socket.emit("onlineUsers", onlineUsers);
  });

  // Handle request for available rooms
  socket.on("getRooms", async () => {
    console.log(`User ${userId} requested available rooms list`);
    // Get rooms from database
    const availableRooms = await chatService.getAvailableRooms();

    console.log(`Available rooms: ${JSON.stringify(availableRooms)}`);
    socket.emit("availableRooms", availableRooms);
  });

  // Handle disconnection
  socket.on("disconnect", async () => {
    const userId = socketUsers.get(socket.id);
    console.log(`User disconnected: ${socket.id} (User ID: ${userId})`);

    if (userId) {
      userSockets.delete(userId);
      socketUsers.delete(socket.id);

      // Update user status in database
      await chatService.setUserOffline(userId);

      // Get updated online users and broadcast
      const onlineUsers = await chatService.getOnlineUsers();
      io.emit("userOffline", { userId });
      io.emit(
        "onlineUsers",
        onlineUsers.map((user) => user.id)
      );
    }
  });

  // Error handling
  socket.on("error", (err) => {
    console.error("Socket error:", err);
  });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
httpServer.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on 0.0.0.0:${PORT} (accessible from Docker)`)
);
