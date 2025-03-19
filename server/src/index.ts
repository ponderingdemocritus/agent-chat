import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";
import { chatService } from "./services/chatService";

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// In-memory socket mappings
const userSockets = new Map<string, Socket>(); // userId -> socket
const socketUsers = new Map<string, string>(); // socketId -> userId

// Authentication helpers
function isValidToken(token: string): boolean {
  return Boolean(token && token.length > 10);
}

function extractUserId(token: string): string {
  return token.split("-")[0];
}

function findSocketByUserId(userId: string): Socket | undefined {
  return userSockets.get(userId);
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const username = socket.handshake.auth.username;

  if (isValidToken(token)) {
    const userId = extractUserId(token);
    socket.data.userId = userId;
    socket.data.username = username || userId;
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

  // Update user status and broadcast online users
  await chatService.upsertUser(userId, true, username);
  const onlineUsers = await chatService.getOnlineUsers();
  io.emit("onlineUsers", onlineUsers);

  // Join global chat and send history
  socket.join("global");
  const globalHistory = await chatService.getGlobalChatHistory();
  socket.emit("globalHistory", globalHistory);

  // Debug event handler
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

  // Direct message handler
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

  // Direct message history handler
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

  // Room operations handlers
  socket.on("joinRoom", ({ roomId }) => {
    socket.join(roomId);
    socket.emit("roomJoined", { roomId });
    io.to(roomId).emit("userJoined", { userId: socket.data.userId, roomId });
  });

  socket.on("roomMessage", async ({ roomId, message }) => {
    const senderId = socket.data.userId;
    const senderUsername = socket.data.username;

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

  // Global chat handler
  socket.on("globalMessage", async ({ message }) => {
    const senderId = socket.data.userId;
    const senderUsername = socket.data.username;

    await chatService.saveGlobalMessage(senderId, message);

    const messageData = {
      senderId,
      senderUsername,
      message,
      timestamp: new Date(),
    };

    io.to("global").emit("globalMessage", messageData);
  });

  // Online users request handler
  socket.on("getOnlineUsers", async () => {
    console.log(`User ${userId} requested online users list`);
    const onlineUsers = await chatService.getOnlineUsers();
    socket.emit("onlineUsers", onlineUsers);
  });

  // Available rooms request handler
  socket.on("getRooms", async () => {
    console.log(`User ${userId} requested available rooms list`);
    const availableRooms = await chatService.getAvailableRooms();
    console.log(`Available rooms: ${JSON.stringify(availableRooms)}`);
    socket.emit("availableRooms", availableRooms);
  });

  // Disconnection handler
  socket.on("disconnect", async () => {
    const userId = socketUsers.get(socket.id);
    console.log(`User disconnected: ${socket.id} (User ID: ${userId})`);

    if (userId) {
      userSockets.delete(userId);
      socketUsers.delete(socket.id);

      await chatService.setUserOffline(userId);

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
