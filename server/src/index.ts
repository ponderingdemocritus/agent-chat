import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";
import { chatService } from "./services/chatService";
import { User as DbUser } from "./services/chatService"; // Make sure this path and type are correct

// Load environment variables
dotenv.config();

interface ClientUser {
  // The structure your client UI expects for user lists
  id: string;
  username: string;
}

// Define the structure of users from DB for augmentation
interface AugmentedUser extends DbUser {
  username: string; // Ensure username is always a string
}

async function getAugmentedUserLists(
  logger: any, // Pass your logger instance
  chatService: any, // Pass your chatService instance
  userSocketsMap: Map<string, Socket> // Pass the server's userSockets map
  // socketUsersMap: Map<string, string> // socketUsersMap is implicitly handled by iterating userSocketsMap (userId -> Socket)
): Promise<{ onlineUsers: ClientUser[]; offlineUsers: ClientUser[] }> {
  logger.debug("getAugmentedUserLists", "Fetching and augmenting user lists.");
  const allUsersFromDB = await chatService.getAllUsers();
  logger.debug(
    "getAugmentedUserLists",
    `Got ${allUsersFromDB ? allUsersFromDB.length : 0} users from DB.`
  );

  const augmentedUsers = new Map<string, AugmentedUser>();

  // 1. Populate with users from the database
  if (allUsersFromDB) {
    for (const dbUser of allUsersFromDB) {
      if (!dbUser || !dbUser.id) {
        // Defensive check
        logger.warn(
          "getAugmentedUserLists",
          `Skipping invalid user from DB: ${JSON.stringify(dbUser)}`
        );
        continue;
      }
      augmentedUsers.set(dbUser.id, {
        ...dbUser,
        username: dbUser.username || dbUser.id, // Ensure username string
      });
    }
  }

  // 2. Cross-reference with active sockets (userSocketsMap: userId -> Socket)
  userSocketsMap.forEach((socketInstance, userId) => {
    if (!userId || !socketInstance || !socketInstance.data) {
      // Defensive check
      logger.warn(
        "getAugmentedUserLists",
        `Skipping invalid entry in userSocketsMap for userId: ${userId}`
      );
      return;
    }
    const usernameFromSocket = socketInstance.data.username || userId;
    const existingUserEntry = augmentedUsers.get(userId);

    if (existingUserEntry) {
      // User is in DB and has an active socket. Ensure they're marked online.
      if (!existingUserEntry.is_online) {
        logger.debug(
          "getAugmentedUserLists",
          `User ${userId} (${usernameFromSocket}) from active socket was marked offline/stale in DB. Correcting to online.`
        );
        existingUserEntry.is_online = true;
        existingUserEntry.last_seen = new Date().toISOString(); // Update last_seen
      }
      // Ensure username is up-to-date from socket data if different
      if (existingUserEntry.username !== usernameFromSocket) {
        logger.debug(
          "getAugmentedUserLists",
          `Updating username for ${userId} from socket data. Old: ${existingUserEntry.username}, New: ${usernameFromSocket}`
        );
        existingUserEntry.username = usernameFromSocket;
      }
    } else {
      // User has an active socket but wasn't in the DB list (very new, or DB issue)
      logger.debug(
        "getAugmentedUserLists",
        `User ${userId} (${usernameFromSocket}) from active socket not in DB list. Adding as online.`
      );
      augmentedUsers.set(userId, {
        id: userId,
        username: usernameFromSocket,
        is_online: true,
        last_seen: new Date().toISOString(),
      });
    }
  });

  const finalUserList = Array.from(augmentedUsers.values());

  const onlineUsersList: ClientUser[] = finalUserList
    .filter((user) => user.is_online)
    .map((u) => ({ id: u.id, username: u.username || u.id }));

  const offlineUsersList: ClientUser[] = finalUserList
    .filter((user) => !user.is_online)
    .map((u) => ({ id: u.id, username: u.username || u.id }));

  logger.debug(
    "getAugmentedUserLists",
    `Returning ${onlineUsersList.length} online, ${offlineUsersList.length} offline users.`
  );
  return { onlineUsers: onlineUsersList, offlineUsers: offlineUsersList };
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

  // Update user status in DB
  await chatService.upsertUser(userId, true, username);
  logger.info("connection", `User ${userId} status upserted to online in DB.`);

  // Join global chat
  socket.join("global");
  logger.debug("connection", `User ${userId} joined global chat`);

  // Fetch global history and available rooms (these don't depend on the current user list state)
  const [globalHistory, availableRooms] = await Promise.all([
    chatService.getGlobalChatHistory(),
    chatService.getAvailableRooms(),
  ]);

  // Generate the user lists using the augmented function for the connecting user's initialData
  const { onlineUsers: initialOnlineUsers, offlineUsers: initialOfflineUsers } =
    await getAugmentedUserLists(logger, chatService, userSockets);

  // Send all initial data at once to the connecting client
  socket.emit("initialData", {
    globalHistory,
    availableRooms,
    onlineUsers: initialOnlineUsers,
    offlineUsers: initialOfflineUsers,
  });
  logger.debug(
    "connection",
    `Sent initial data (using augmented lists) to user ${userId}`
  );

  // Only emit a userJoined event to other clients (no change to this part)
  // This event signals other clients to add this user, but their next full refresh
  // (or their own initialData if they just connected) will use the augmented list.
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
    const requestingUserId = socketUsers.get(socket.id); // Get ID of user making request
    logger.debug(
      "getAllUsers",
      `User ${requestingUserId || socket.id} requested all users list`
    );
    try {
      // Use the new augmented function
      const { onlineUsers, offlineUsers } = await getAugmentedUserLists(
        logger,
        chatService,
        userSockets
      );

      socket.emit("userLists", {
        // Ensure your React client listens to 'userLists' for these updates
        onlineUsers,
        offlineUsers,
      });
      logger.debug(
        "getAllUsers",
        `Sent ${onlineUsers.length} online and ${
          offlineUsers.length
        } offline users to ${requestingUserId || socket.id}`
      );
    } catch (error) {
      logger.error(
        "getAllUsers",
        `Error fetching users for ${requestingUserId || socket.id}`,
        error
      );
      socket.emit("error", { message: "Failed to fetch users" }); // Generic error to client
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
