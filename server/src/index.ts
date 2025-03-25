import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";
import { chatService } from "./services/chatService";

// Load environment variables
dotenv.config();

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
    logger.error("auth", `Invalid token provided by socket ${socket.id}`);
    next(new Error("Authentication error"));
  }
});

io.on("connection", async (socket) => {
  const userId = socket.data.userId;
  const username = socket.data.username;
  logger.info(
    "connection",
    `User connected: ${socket.id} (User: ${userId}, Username: ${username})`
  );

  // Store socket mapping
  userSockets.set(userId, socket);
  socketUsers.set(socket.id, userId);

  // Update user status
  await chatService.upsertUser(userId, true, username);

  // Join global chat and send history
  socket.join("global");
  logger.debug("connection", `User ${userId} joined global chat`);

  const [globalHistory, availableRooms, allUsers] = await Promise.all([
    chatService.getGlobalChatHistory(),
    chatService.getAvailableRooms(),
    chatService.getAllUsers(),
  ]);

  // Split users into online and offline, ensuring usernames are set
  const onlineUsers = allUsers
    .filter((user) => user.is_online)
    .map((user) => ({
      id: user.id,
      username: user.username || user.id,
    }));
  const offlineUsers = allUsers
    .filter((user) => !user.is_online)
    .map((user) => ({
      id: user.id,
      username: user.username || user.id,
    }));

  // Send all initial data at once
  socket.emit("initialData", {
    globalHistory,
    availableRooms,
    onlineUsers,
    offlineUsers,
  });
  logger.debug("connection", `Sent initial data to user ${userId}`);

  // Only emit a userJoined event to other clients, not the full user list
  socket.broadcast.emit("userJoined", {
    user: {
      id: userId,
      username: username || userId,
    },
  });

  // Debug event handler
  socket.on("debug", async (data) => {
    try {
      logger.debug(
        "debug",
        `Debug request from ${userId}: ${JSON.stringify(data)}`
      );

      if (data.type === "messageCounts") {
        const counts = await chatService.debugGetMessagesByType();
        socket.emit("debugResult", { type: "messageCounts", counts });
        logger.debug("debug", `Sent message counts to ${userId}`);
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
        logger.debug(
          "debug",
          `Sent ${messages.length} direct messages with ${data.otherUserId} to ${userId}`
        );
      }
    } catch (error) {
      logger.error(
        "debug",
        `Error processing debug request from ${userId}`,
        error
      );
      socket.emit("debugResult", { error: "Debug operation failed" });
    }
  });

  // Direct message handler
  socket.on("directMessage", async ({ recipientId, message }) => {
    const senderId = socket.data.userId;
    const senderUsername = socket.data.username;
    logger.debug(
      "directMessage",
      `User ${senderId} sending message to ${recipientId}`
    );

    try {
      // Save message to database
      const savedMessage = await chatService.saveDirectMessage(
        senderId,
        recipientId,
        message
      );

      // Forward to recipient if online
      const recipientSocket = findSocketByUserId(recipientId);
      if (recipientSocket) {
        logger.debug(
          "directMessage",
          `Recipient ${recipientId} is online, forwarding message`
        );
        recipientSocket.emit("directMessage", {
          senderId,
          senderUsername,
          recipientId,
          message,
          timestamp: new Date(),
        });
      } else {
        logger.debug(
          "directMessage",
          `Recipient ${recipientId} is offline, message stored for later delivery`
        );
      }

      // Confirm delivery to sender
      socket.emit("messageSent", { recipientId, message });
    } catch (error) {
      logger.error(
        "directMessage",
        `Failed to process message from ${senderId} to ${recipientId}`,
        error
      );
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Direct message history handler
  socket.on("getDirectMessageHistory", async ({ otherUserId, requestId }) => {
    logger.debug(
      "getDirectMessageHistory",
      `User ${userId} requested history with ${otherUserId}`
    );

    try {
      // Acknowledge receipt of the request immediately with the same requestId
      socket.emit("directMessageHistoryRequested", {
        otherUserId,
        requestId: requestId || Date.now().toString(),
      });

      const history = await chatService.getDirectMessageHistory(
        userId,
        otherUserId
      );

      // Emit with the original requestId for correlation
      socket.emit("directMessageHistory", {
        otherUserId,
        messages: history,
        requestId: requestId || Date.now().toString(),
      });
      logger.debug(
        "getDirectMessageHistory",
        `Sent ${history.length} messages to ${userId}`
      );
    } catch (error) {
      logger.error(
        "getDirectMessageHistory",
        `Error fetching history for ${userId} with ${otherUserId}`,
        error
      );
      socket.emit("error", {
        message: "Failed to get message history",
        requestId,
      });
    }
  });

  // Room operations handlers
  socket.on("joinRoom", ({ roomId }) => {
    logger.debug("joinRoom", `User ${userId} joining room ${roomId}`);
    socket.join(roomId);
    socket.emit("roomJoined", { roomId });
    io.to(roomId).emit("userJoined", { userId: socket.data.userId, roomId });
  });

  socket.on("roomMessage", async ({ roomId, message }) => {
    const senderId = socket.data.userId;
    const senderUsername = socket.data.username;
    logger.debug(
      "roomMessage",
      `User ${senderId} sending message to room ${roomId}`
    );

    await chatService.saveRoomMessage(senderId, roomId, message);

    io.to(roomId).emit("roomMessage", {
      senderId,
      senderUsername,
      roomId,
      message,
      timestamp: new Date(),
    });
  });

  socket.on("getRoomHistory", async ({ roomId }) => {
    logger.debug(
      "getRoomHistory",
      `User ${userId} requested history for room ${roomId}`
    );
    const history = await chatService.getRoomMessageHistory(roomId);
    socket.emit("roomHistory", { roomId, messages: history });
    logger.debug(
      "getRoomHistory",
      `Sent ${history.length} messages to ${userId} for room ${roomId}`
    );
  });

  socket.on("leaveRoom", ({ roomId }) => {
    logger.debug("leaveRoom", `User ${userId} leaving room ${roomId}`);
    socket.leave(roomId);
    io.to(roomId).emit("userLeft", { userId: socket.data.userId, roomId });
  });

  // Global chat handler
  socket.on("globalMessage", async ({ message }) => {
    const senderId = socket.data.userId;
    const senderUsername = socket.data.username;
    logger.debug("globalMessage", `User ${senderId} sending global message`);

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
    logger.debug(
      "getOnlineUsers",
      `User ${userId} requested online users list`
    );
    const onlineUsers = await chatService.getOnlineUsers();
    socket.emit("onlineUsers", onlineUsers);
    logger.debug(
      "getOnlineUsers",
      `Sent ${onlineUsers.length} online users to ${userId}`
    );
  });

  // Add new handler for getting all users (both online and offline)
  socket.on("getAllUsers", async () => {
    logger.debug("getAllUsers", `User ${userId} requested all users list`);
    try {
      // Get all users from the database
      const allUsers = await chatService.getAllUsers();

      // Split into online and offline users
      const onlineUsers = allUsers.filter((user) => user.is_online);
      const offlineUsers = allUsers.filter((user) => !user.is_online);

      // Send both lists to the client
      socket.emit("userLists", {
        onlineUsers,
        offlineUsers,
      });
      logger.debug(
        "getAllUsers",
        `Sent ${onlineUsers.length} online and ${offlineUsers.length} offline users to ${userId}`
      );
    } catch (error) {
      logger.error("getAllUsers", `Error fetching users for ${userId}`, error);
      socket.emit("error", { message: "Failed to fetch users" });
    }
  });

  // Available rooms request handler
  socket.on("getRooms", async () => {
    logger.debug("getRooms", `User ${userId} requested available rooms`);
    const availableRooms = await chatService.getAvailableRooms();
    socket.emit("availableRooms", availableRooms);
    logger.debug(
      "getRooms",
      `Sent ${availableRooms.length} rooms to ${userId}`
    );
  });

  // Disconnection handler
  socket.on("disconnect", async () => {
    const userId = socketUsers.get(socket.id);
    logger.info(
      "disconnect",
      `User disconnected: ${socket.id} (User ID: ${userId})`
    );

    if (userId) {
      userSockets.delete(userId);
      socketUsers.delete(socket.id);

      await chatService.setUserOffline(userId);

      // Only broadcast user offline event, not the full list again
      socket.broadcast.emit("userOffline", { userId });
    }
  });

  // Error handling
  socket.on("error", (err) => {
    logger.error(
      "socketError",
      `Error on socket ${socket.id} (User: ${userId})`,
      err
    );
  });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
httpServer.listen(PORT, "0.0.0.0", () =>
  logger.info("server", `Server running on 0.0.0.0:${PORT}`)
);
