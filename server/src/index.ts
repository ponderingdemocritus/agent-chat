// src/server.ts
import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";

// User and socket tracking
interface UserSocket {
  userId: string;
  socket: Socket;
}

// In-memory storage
const userSockets = new Map<string, Socket>(); // userId -> socket
const socketUsers = new Map<string, string>(); // socketId -> userId
const globalChatHistory: {
  senderId: string;
  message: string;
  timestamp: Date;
}[] = [];

// Track online users
const onlineUsers = new Set<string>(); // Set of online userIds

// Mock functions for authentication and database operations
// In a real app, these would connect to your actual auth system and database
function isValidToken(token: string): boolean {
  console.log(`Validating token: ${token}`);
  // Mock implementation - replace with actual JWT verification
  return Boolean(token && token.length > 10);
}

function extractUserId(token: string): string {
  // Mock implementation - replace with actual JWT decoding
  return token.split("-")[0];
}

async function saveDirectMessage(
  senderId: string,
  recipientId: string,
  message: string
): Promise<void> {
  // Mock implementation - replace with actual database call
  console.log(`Storing message from ${senderId} to ${recipientId}: ${message}`);
  // In a real app: await db.collection('directMessages').insertOne({...})
}

function findSocketByUserId(userId: string): Socket | undefined {
  return userSockets.get(userId);
}

function updateGlobalChatHistory(senderId: string, message: string): void {
  globalChatHistory.push({ senderId, message, timestamp: new Date() });
  if (globalChatHistory.length > 100) globalChatHistory.shift(); // Keep last 100
}

function getGlobalChatHistory() {
  return globalChatHistory;
}

// Get list of online users
function getOnlineUsers() {
  console.log(`Current online users: ${Array.from(onlineUsers).join(", ")}`);
  return Array.from(onlineUsers);
}

const app = express();
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

  if (isValidToken(token)) {
    const userId = extractUserId(token);
    socket.data.userId = userId;
    next();
  } else {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;
  console.log(`User connected: ${socket.id} (User ID: ${userId})`);

  // Store socket mapping
  userSockets.set(userId, socket);
  socketUsers.set(socket.id, userId);

  // Add user to online users and broadcast
  onlineUsers.add(userId);
  console.log(
    `User ${userId} added to online users. Total: ${onlineUsers.size}`
  );
  io.emit("onlineUsers", getOnlineUsers());

  // Join global chat automatically
  socket.join("global");
  socket.emit("globalHistory", getGlobalChatHistory());

  // Handle direct messages
  socket.on("directMessage", async ({ recipientId, message }) => {
    const senderId = socket.data.userId;

    // Save message to database (for history and offline delivery)
    await saveDirectMessage(senderId, recipientId, message);

    // Forward to recipient if online
    const recipientSocket = findSocketByUserId(recipientId);
    if (recipientSocket) {
      recipientSocket.emit("directMessage", {
        senderId,
        recipientId,
        message,
        timestamp: new Date(),
      });
    }

    // Confirm delivery to sender
    socket.emit("messageSent", { recipientId, message });
  });

  // Handle room operations
  socket.on("joinRoom", ({ roomId }) => {
    socket.join(roomId);
    socket.emit("roomJoined", { roomId });
    io.to(roomId).emit("userJoined", { userId: socket.data.userId, roomId });
  });

  socket.on("roomMessage", ({ roomId, message }) => {
    io.to(roomId).emit("roomMessage", {
      senderId: socket.data.userId,
      roomId,
      message,
      timestamp: new Date(),
    });
    // In a real app, store room messages in database
  });

  socket.on("leaveRoom", ({ roomId }) => {
    socket.leave(roomId);
    io.to(roomId).emit("userLeft", { userId: socket.data.userId, roomId });
  });

  // Handle global chat
  socket.on("globalMessage", ({ message }) => {
    const senderId = socket.data.userId;
    const messageData = {
      senderId,
      message,
      timestamp: new Date(),
    };

    io.to("global").emit("globalMessage", messageData);
    updateGlobalChatHistory(senderId, message);
  });

  // Handle request for online users
  socket.on("getOnlineUsers", () => {
    console.log(`User ${userId} requested online users list`);
    socket.emit("onlineUsers", getOnlineUsers());
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    const userId = socketUsers.get(socket.id);
    console.log(`User disconnected: ${socket.id} (User ID: ${userId})`);

    if (userId) {
      userSockets.delete(userId);
      socketUsers.delete(socket.id);

      // Remove from online users and broadcast update
      onlineUsers.delete(userId);
      console.log(
        `User ${userId} removed from online users. Total: ${onlineUsers.size}`
      );
      io.emit("userOffline", { userId });
      io.emit("onlineUsers", getOnlineUsers());
    }
  });

  // Error handling
  socket.on("error", (err) => {
    console.error("Socket error:", err);
  });
});

httpServer.listen(3000, "0.0.0.0", () =>
  console.log("Server running on 0.0.0.0:3000 (accessible from Docker)")
);
