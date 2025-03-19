import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ChatClient from "./chat";
import "./App.css";
import { Button } from "./components/ui/button";
import React from "react";

// Function to generate deterministic userID and token from username
const generateUserCredentials = (username: string) => {
  // Simple hash function to convert username to a numeric value
  const hash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString();
  };

  const userId = hash(username);
  const token = `${userId}-jwt-token-${hash(username + "salt")}`;

  return { userId, token };
};

// Default values for initial state (will be replaced once username is set)
const initialUserId = "";
const initialToken = "";

// Message type definition
interface Message {
  id: string;
  senderId: string;
  senderUsername?: string;
  message: string;
  timestamp: Date;
  type: "direct" | "room" | "global";
  roomId?: string;
  recipientId?: string;
}

// User type definition
interface User {
  id: string;
  username?: string;
  is_online?: boolean;
}

// Room type definition
interface Room {
  id: string;
  name?: string;
  userCount?: number;
}

// MessageGroup component for better performance
const MessageGroup = React.memo(
  ({
    group,
    userId,
    selectRecipient,
  }: {
    group: {
      senderId: string;
      senderUsername?: string;
      messages: Message[];
    };
    userId: string;
    selectRecipient: (userId: string) => void;
  }) => {
    return (
      <div className="message-group">
        {/* Sender info for the group */}
        <div className="flex items-center">
          <div
            className={`h-6 w-6 flex items-center justify-center text-sm ${
              group.senderId === userId ? "bg-orange-600/40" : "bg-green-600/40"
            } mr-2`}
          >
            {(group.senderUsername || group.senderId).charAt(0).toUpperCase()}
          </div>
          <span
            className={`text-sm font-medium ${
              group.senderId === userId
                ? "text-gray-300/70"
                : "text-gray-200 hover:text-white hover:underline cursor-pointer"
            }`}
            onClick={() =>
              group.senderId !== userId && selectRecipient(group.senderId)
            }
          >
            {group.senderId === userId
              ? "You"
              : group.senderUsername || group.senderId}
          </span>
          <span className="text-xs text-gray-400 ml-2 align-bottom">
            {new Date(group.messages[0].timestamp).toLocaleTimeString()}
          </span>
        </div>

        {/* Messages from this sender */}
        <div className="pl-7 space-y-1.5 mt-1">
          {group.messages.map((msg) => (
            <div key={msg.id} className="flex flex-col">
              <div
                className={`px-3 py-2 inline-block max-w-[85%] ${
                  msg.senderId === userId
                    ? "bg-orange-600/30 text-white"
                    : "bg-gray-700/50 text-gray-100"
                }`}
              >
                {msg.message}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
  // Custom comparison function to ensure component updates when needed
  (prevProps, nextProps) => {
    // Re-render if there are new messages in the group
    if (prevProps.group.messages.length !== nextProps.group.messages.length) {
      return false;
    }
    // Re-render if the last message ID is different
    if (
      prevProps.group.messages[prevProps.group.messages.length - 1]?.id !==
      nextProps.group.messages[nextProps.group.messages.length - 1]?.id
    ) {
      return false;
    }
    return true;
  }
);

// MessageInput component to prevent re-renders of the entire app when typing
const MessageInput = React.memo(
  ({ onSendMessage }: { onSendMessage: (message: string) => void }) => {
    const [message, setMessage] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim()) return;
      onSendMessage(message);
      setMessage("");
    };

    return (
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-gray-800 flex-shrink-0 bg-gray-900"
      >
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 p-2 border bg-gray-800 border-gray-700 text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-orange-600 text-white hover:bg-orange-700 transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    );
  }
);

function App() {
  // User state
  const [userId, setUserId] = useState<string>(initialUserId);
  const [userToken, setUserToken] = useState<string>(initialToken);
  const [username, setUsername] = useState<string>("");
  const [isUsernameSet, setIsUsernameSet] = useState<boolean>(false);

  // Chat state
  const [chatClient, setChatClient] = useState<ChatClient | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<"global" | "direct" | "room">(
    "global"
  );
  const [directMessageRecipient, setDirectMessageRecipient] = useState("");
  const [activeRoom, setActiveRoom] = useState("");
  const [newRoomId, setNewRoomId] = useState("");

  // Online users state
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [offlineUsers, setOfflineUsers] = useState<User[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [_showOnlineUsers, setShowOnlineUsers] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Unread messages state - track unread messages by user ID
  const [unreadMessages, setUnreadMessages] = useState<Record<string, number>>(
    {}
  );

  // Auto-scroll to bottom of messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Add search state variables
  const [roomSearch, setRoomSearch] = useState<string>("");
  const [userSearch, setUserSearch] = useState<string>("");

  // Scroll helper function for consistency
  const scrollToBottom = useCallback(() => {
    console.log("Scrolling to bottom");

    // First attempt at immediate scroll
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }

    // Secondary attempt with a short delay
    setTimeout(() => {
      // Method 1: Using scrollIntoView with immediate behavior
      messagesEndRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });

      // Method 2: Direct container manipulation as backup
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop =
          chatContainerRef.current.scrollHeight;
      }
    }, 10);

    // Final attempt with a longer delay to catch any edge cases
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop =
          chatContainerRef.current.scrollHeight;
      }
    }, 300);
  }, []);

  // Auto-scroll when messages change
  useEffect(() => {
    console.log("Messages updated, triggering scroll");
    scrollToBottom();
  }, [messages, activeTab, scrollToBottom]);

  // Add a message to the state with optimistic update for better UX
  const addMessage = useCallback(
    (message: Message) => {
      console.log("Adding message:", message);
      // Force a new array reference to ensure React detects the change
      setMessages((prevMessages) => {
        console.log("Previous message count:", prevMessages.length);

        // Check for duplicates based on content, sender, type and timestamp proximity
        const isDuplicate = prevMessages.some(
          (existing) =>
            existing.message === message.message &&
            existing.senderId === message.senderId &&
            existing.type === message.type &&
            (message.type === "direct"
              ? existing.recipientId === message.recipientId
              : true) &&
            (message.type === "room"
              ? existing.roomId === message.roomId
              : true) &&
            // Check if timestamps are within 2 seconds of each other
            Math.abs(
              new Date(existing.timestamp).getTime() -
                new Date(message.timestamp).getTime()
            ) < 2000
        );

        if (isDuplicate) {
          console.log("Duplicate message detected, not adding:", message);
          return prevMessages; // Return unchanged array
        }

        const newMessages = [...prevMessages, message];
        console.log("New message count:", newMessages.length);
        return newMessages;
      });

      // Force scroll after adding message
      scrollToBottom();
    },
    [scrollToBottom]
  );

  // Filter messages based on active tab
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      if (activeTab === "global") return msg.type === "global";
      if (activeTab === "direct") {
        // Only show direct messages that involve the current user and the selected recipient
        const isRelevantMessage =
          msg.type === "direct" &&
          ((msg.senderId === userId &&
            msg.recipientId === directMessageRecipient) ||
            (msg.senderId === directMessageRecipient &&
              (msg.recipientId === userId || msg.recipientId === undefined)));

        // Debug logging removed
        return isRelevantMessage;
      }
      if (activeTab === "room")
        return msg.type === "room" && msg.roomId === activeRoom;
      return false;
    });
  }, [messages, activeTab, userId, directMessageRecipient, activeRoom]);

  // Sort messages based on active tab
  const sortedMessages = useMemo(() => {
    return [...filteredMessages].sort((a, b) => {
      // Sort all messages by timestamp (oldest first) for all chat types
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }, [filteredMessages]);

  // Group messages by sender
  const messageGroups = useMemo(() => {
    return sortedMessages.reduce(
      (
        groups: Array<{
          senderId: string;
          senderUsername?: string;
          messages: Message[];
        }>,
        msg
      ) => {
        // Get the last group or create a new one if none exists
        const lastGroup = groups.length > 0 ? groups[groups.length - 1] : null;

        // Check if this is a new sender or if there's a significant time gap (5+ minutes)
        const timeDiff = lastGroup
          ? Math.abs(
              new Date(msg.timestamp).getTime() -
                new Date(
                  lastGroup.messages[lastGroup.messages.length - 1].timestamp
                ).getTime()
            )
          : Infinity;
        const isNewTimeGroup = timeDiff > 5 * 60 * 1000; // 5 minutes

        // Always create a new group for short messages like "hey"
        const isShortMessage = msg.message.trim().split(/\s+/).length <= 1;

        // If this is a new sender, time gap, or short message, create a new group
        if (
          !lastGroup ||
          lastGroup.senderId !== msg.senderId ||
          isNewTimeGroup ||
          isShortMessage
        ) {
          groups.push({
            senderId: msg.senderId,
            senderUsername: msg.senderUsername,
            messages: [msg],
          });
        } else {
          // Add to existing group if same sender and within time window
          lastGroup.messages.push(msg);
        }

        return groups;
      },
      []
    );
  }, [sortedMessages]);

  // Set direct message recipient from online users list
  const selectRecipient = useCallback(
    (userId: string) => {
      console.log(`Selecting recipient: ${userId}`);
      setDirectMessageRecipient(userId);
      setActiveTab("direct");
      setShowOnlineUsers(false);

      // Clear unread messages for this user
      setUnreadMessages((prev) => ({
        ...prev,
        [userId]: 0,
      }));

      // Request message history with this user
      if (chatClient) {
        console.log(`Requesting direct message history with ${userId}`);
        chatClient.getDirectMessageHistory(userId);
      }
    },
    [
      chatClient,
      setDirectMessageRecipient,
      setActiveTab,
      setShowOnlineUsers,
      setUnreadMessages,
    ]
  );

  // Send a message based on active tab
  const handleSendMessage = useCallback(
    (message: string) => {
      if (!chatClient) return;

      switch (activeTab) {
        case "global":
          chatClient.sendGlobalMessage(message);
          // Add to our local messages for immediate feedback
          addMessage({
            id: Date.now().toString(),
            senderId: userId,
            senderUsername: username,
            message: message,
            timestamp: new Date(),
            type: "global",
          });
          break;
        case "direct":
          if (directMessageRecipient) {
            chatClient.sendDirectMessage(directMessageRecipient, message);
            // Add to our local messages for immediate feedback
            addMessage({
              id: Date.now().toString(),
              senderId: userId,
              senderUsername: username,
              recipientId: directMessageRecipient,
              message: message,
              timestamp: new Date(),
              type: "direct",
            });
          }
          break;
        case "room":
          if (activeRoom) {
            chatClient.sendRoomMessage(activeRoom, message);
            // Add to our local messages for immediate feedback
            addMessage({
              id: Date.now().toString(),
              senderId: userId,
              senderUsername: username,
              message: message,
              timestamp: new Date(),
              type: "room",
              roomId: activeRoom,
            });
          }
          break;
      }
    },
    [
      activeTab,
      chatClient,
      directMessageRecipient,
      activeRoom,
      userId,
      username,
      addMessage,
    ]
  );

  // Handle username submission
  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    // Generate deterministic userID and token from username
    const { userId: generatedUserId, token: generatedToken } =
      generateUserCredentials(username);

    // Set the user credentials
    setUserId(generatedUserId);
    setUserToken(generatedToken);
    setIsUsernameSet(true);
  };

  // Initialize chat client after username is set
  useEffect(() => {
    if (!isUsernameSet) return;

    console.log("Initializing chat client");
    let client: ChatClient | null = new ChatClient(userToken, username);
    setChatClient(client);

    // Custom event listeners for our UI
    const handleDirectMessage = ({
      senderId,
      senderUsername,
      recipientId,
      message,
      timestamp,
    }: any) => {
      console.log(
        `Received direct message from ${senderId} (${senderUsername}) to ${
          recipientId || userId
        }: ${message}`
      );

      // If recipientId is not provided, it's a message to the current user
      const actualRecipientId = recipientId || userId;

      addMessage({
        id: Date.now().toString(),
        senderId,
        senderUsername,
        recipientId: actualRecipientId,
        message,
        timestamp: timestamp || new Date(),
        type: "direct",
      });

      // If this is a message TO the current user FROM someone else,
      // and we're not currently viewing that conversation, increment unread count
      if (
        senderId !== userId &&
        actualRecipientId === userId &&
        directMessageRecipient !== senderId
      ) {
        setUnreadMessages((prev) => ({
          ...prev,
          [senderId]: (prev[senderId] || 0) + 1,
        }));
      }
    };

    const handleRoomMessage = ({
      senderId,
      senderUsername,
      roomId,
      message,
      timestamp,
    }: any) => {
      addMessage({
        id: Date.now().toString(),
        senderId,
        senderUsername,
        message,
        timestamp: timestamp || new Date(),
        type: "room",
        roomId,
      });
    };

    const handleGlobalMessage = ({
      senderId,
      senderUsername,
      message,
      timestamp,
    }: any) => {
      addMessage({
        id: Date.now().toString(),
        senderId,
        senderUsername,
        message,
        timestamp: timestamp || new Date(),
        type: "global",
      });
    };

    // Handle online users updates
    const handleOnlineUsers = (users: User[]) => {
      console.log("Received online users:", users);
      setOnlineUsers(users);
    };

    // Handle user lists (both online and offline)
    const handleUserLists = ({
      onlineUsers,
      offlineUsers,
    }: {
      onlineUsers: User[];
      offlineUsers: User[];
    }) => {
      console.log(
        `Received user lists: ${onlineUsers.length} online, ${offlineUsers.length} offline`
      );
      setOnlineUsers(onlineUsers);
      setOfflineUsers(offlineUsers);
    };

    // Handle available rooms updates
    const handleAvailableRooms = (rooms: Room[]) => {
      setAvailableRooms(rooms);
    };

    // Monitor connection status
    client.socket.on("connect", () => {
      console.log("Socket connected with ID:", client?.socket.id);
    });

    client.socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    client.socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
    });

    // Register event handlers
    client.socket.on("directMessage", handleDirectMessage);
    client.socket.on("roomMessage", handleRoomMessage);
    client.socket.on("globalMessage", handleGlobalMessage);
    client.socket.on("onlineUsers", handleOnlineUsers);
    client.socket.on("userLists", handleUserLists);
    client.socket.on("availableRooms", handleAvailableRooms);

    // Register history event handlers
    client.socket.on("globalHistory", (history) => {
      const historyMessages = history.map((msg: any) => ({
        id: Date.now() + Math.random().toString(),
        senderId: msg.sender_id,
        senderUsername: msg.username,
        message: msg.message,
        timestamp: new Date(msg.created_at),
        type: "global",
      }));
      setMessages((prev) => [...prev, ...historyMessages]);
    });

    client.socket.on(
      "directMessageHistory",
      ({ otherUserId, messages: historyMessages }) => {
        console.log(
          `Received direct message history with ${otherUserId}:`,
          historyMessages
        );

        if (historyMessages && Array.isArray(historyMessages)) {
          const formattedMessages = historyMessages.map((msg: any) => {
            // Ensure we have the correct sender and recipient IDs
            let senderId = msg.sender_id;
            let recipientId = msg.recipient_id;

            // If the message doesn't have a recipient_id, it's likely a direct message
            // where the recipient is implied (the current user)
            if (!recipientId && msg.room_id === null) {
              recipientId = senderId === userId ? otherUserId : userId;
            }

            return {
              id: msg.id || Date.now() + Math.random().toString(),
              senderId,
              senderUsername: msg.username,
              recipientId,
              message: msg.message,
              timestamp: new Date(msg.created_at),
              type: "direct" as const,
            };
          });

          // Replace existing direct messages with these users
          setMessages((prev) => {
            // Filter out existing direct messages between these users
            const filteredMessages = prev.filter(
              (msg) =>
                !(
                  msg.type === "direct" &&
                  ((msg.senderId === userId &&
                    msg.recipientId === otherUserId) ||
                    (msg.senderId === otherUserId &&
                      (msg.recipientId === userId ||
                        msg.recipientId === undefined)))
                )
            );

            // Add the new history messages
            return [...filteredMessages, ...formattedMessages];
          });

          // If we're viewing this user's messages, clear their unread count
          if (directMessageRecipient === otherUserId) {
            setUnreadMessages((prev) => ({
              ...prev,
              [otherUserId]: 0,
            }));
          }
        }
      }
    );

    client.socket.on("roomHistory", ({ roomId, messages: historyMessages }) => {
      console.log(`Received room history for ${roomId}:`, historyMessages);

      if (historyMessages && Array.isArray(historyMessages)) {
        const formattedMessages = historyMessages.map((msg: any) => ({
          id: msg.id || Date.now() + Math.random().toString(),
          senderId: msg.sender_id,
          senderUsername: msg.username,
          message: msg.message,
          timestamp: new Date(msg.created_at),
          type: "room" as const,
          roomId: msg.room_id,
        }));

        // Replace existing room messages
        setMessages((prev) => {
          // Filter out existing messages for this room
          const filteredMessages = prev.filter(
            (msg) => !(msg.type === "room" && msg.roomId === roomId)
          );

          // Add the new history messages
          return [...filteredMessages, ...formattedMessages];
        });
      }
    });

    // Request initial data once (after a short delay to ensure connection is ready)
    const initTimer = setTimeout(() => {
      if (client?.socket.connected) {
        console.log("Requesting initial data");
        client.getAllUsers();
        client.getRooms();
      }
    }, 500);

    // Set up an interval to periodically request online users and rooms
    const updateInterval = setInterval(() => {
      if (client?.socket.connected) {
        console.log("Refreshing user and room data");
        client.getAllUsers();
        client.getRooms();
      }
    }, 30000); // Request every 30 seconds (increased from 10 seconds)

    return () => {
      console.log("Cleaning up chat client");
      // Clear timers first
      clearTimeout(initTimer);
      clearInterval(updateInterval);

      // Clean up event listeners
      if (client) {
        client.socket.off("directMessage", handleDirectMessage);
        client.socket.off("roomMessage", handleRoomMessage);
        client.socket.off("globalMessage", handleGlobalMessage);
        client.socket.off("globalHistory");
        client.socket.off("directMessageHistory");
        client.socket.off("roomHistory");
        client.socket.off("onlineUsers", handleOnlineUsers);
        client.socket.off("userLists", handleUserLists);
        client.socket.off("availableRooms", handleAvailableRooms);
        client.socket.off("connect");
        client.socket.off("disconnect");
        client.socket.off("connect_error");

        // Disconnect socket to prevent memory leaks
        client.socket.disconnect();
        client = null;
      }
    };
  }, [
    userToken,
    username,
    isUsernameSet,
    userId,
    directMessageRecipient,
    addMessage,
    setUnreadMessages,
  ]); // Removed offlineUsers.length from dependencies

  // Join a room
  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomId.trim() || !chatClient) return;

    chatClient.joinRoom(newRoomId);
    setActiveRoom(newRoomId);
    setActiveTab("room");

    // Request room history
    chatClient.getRoomHistory(newRoomId);

    setNewRoomId("");
  };

  // Join a room from the sidebar
  const joinRoomFromSidebar = (roomId: string) => {
    if (!chatClient) return;

    chatClient.joinRoom(roomId);
    setActiveRoom(roomId);
    setActiveTab("room");

    // Request room history
    chatClient.getRoomHistory(roomId);
  };

  // Filter rooms based on search input
  const filteredRooms = useMemo(() => {
    if (!roomSearch.trim()) return availableRooms;

    return availableRooms.filter((room) =>
      (room.name || room.id).toLowerCase().includes(roomSearch.toLowerCase())
    );
  }, [availableRooms, roomSearch]);

  // Filter users based on search input
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return onlineUsers;

    return onlineUsers.filter((user) =>
      (user.username || user.id)
        .toLowerCase()
        .includes(userSearch.toLowerCase())
    );
  }, [onlineUsers, userSearch]);

  // Filter offline users based on search input
  const filteredOfflineUsers = useMemo(() => {
    if (!userSearch.trim()) return offlineUsers;

    return offlineUsers.filter((user) =>
      (user.username || user.id)
        .toLowerCase()
        .includes(userSearch.toLowerCase())
    );
  }, [offlineUsers, userSearch]);

  // If username is not set, show username form
  if (!isUsernameSet) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black text-white">
        <div className="bg-gray-800/50 p-8 border border-gray-700/50 backdrop-blur-sm">
          <h1 className="text-3xl font-bold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-orange-700">
            Welcome to Game Chat
          </h1>
          <form
            onSubmit={handleUsernameSubmit}
            className="flex flex-col items-center"
          >
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="px-4 py-3 mb-4 border w-72 bg-gray-700/60 border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <Button
              variant={"default"}
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2.5 transition-colors"
            >
              Join Chat
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-950 text-gray-100">
      {/* Online Users Sidebar */}
      {sidebarVisible && (
        <div className="w-72 h-full bg-gray-900 text-gray-200 shadow-lg flex-shrink-0 flex flex-col border-r border-gray-700/50">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-gray-700/40 bg-gray-900/80">
            <h1 className="text-xl font-bold text-white flex items-center">
              <span className="bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
                Game Chat
              </span>
              <button
                className="text-xl ml-auto hover:text-gray-400 transition-colors"
                onClick={() => setSidebarVisible(false)}
              >
                &times;
              </button>
            </h1>
          </div>

          {/* Rooms Section */}
          <div className="px-4 py-3 border-b border-gray-700/40">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-md font-bold text-white">Rooms</h2>
              <span className="bg-orange-600/60 px-2 py-0.5 text-xs font-medium">
                {availableRooms.length}
              </span>
            </div>

            {/* Room Search */}
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Search rooms..."
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
                className="w-full p-2 pl-8 text-sm border bg-gray-800/60 border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 absolute left-2 top-2.5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {roomSearch && (
                <button
                  className="absolute right-2 top-2.5 text-gray-400 hover:text-white"
                  onClick={() => setRoomSearch("")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>

            <div className="overflow-y-auto max-h-40">
              {filteredRooms.length === 0 ? (
                roomSearch ? (
                  <p className="text-gray-400 text-center text-sm py-2">
                    No rooms match your search
                  </p>
                ) : (
                  <p className="text-gray-400 text-center text-sm py-2">
                    No active rooms
                  </p>
                )
              ) : (
                <ul className="space-y-1">
                  {filteredRooms.map((room) => (
                    <li
                      key={room.id}
                      className={`flex items-center px-3 py-2 cursor-pointer transition-colors ${
                        room.id === activeRoom
                          ? "bg-orange-600/20 border-l-2 border-orange-500"
                          : "hover:bg-gray-800/50"
                      }`}
                      onClick={() => joinRoomFromSidebar(room.id)}
                    >
                      <div className="flex items-center justify-center w-6 h-6 bg-orange-600/20 mr-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5 text-orange-300"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
                          />
                        </svg>
                      </div>
                      <span className="text-sm truncate">
                        {room.name || room.id}
                      </span>
                      {room.userCount && (
                        <span className="ml-auto bg-gray-600/70 px-2 py-0.5 text-xs">
                          {room.userCount}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form onSubmit={joinRoom} className="mt-3 flex space-x-1">
              <input
                type="text"
                placeholder="Join or Create Room"
                value={newRoomId}
                onChange={(e) => setNewRoomId(e.target.value)}
                className="flex-1 p-2 text-sm border bg-gray-800/60 border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-orange-600 text-white hover:bg-orange-700 text-sm transition-colors"
              >
                +
              </button>
            </form>
          </div>

          {/* Users Section */}
          <div className="px-4 py-3 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-md font-bold text-white">Users</h2>
              <span className="bg-green-600/60 px-2 py-0.5 text-xs font-medium">
                {onlineUsers.length} online
              </span>
            </div>

            {/* User Search */}
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full p-2 pl-8 text-sm border bg-gray-800/60 border-gray-600 text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 absolute left-2 top-2.5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              {userSearch && (
                <button
                  className="absolute right-2 top-2.5 text-gray-400 hover:text-white"
                  onClick={() => setUserSearch("")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {filteredUsers.length === 0 &&
              filteredOfflineUsers.length === 0 ? (
                userSearch ? (
                  <p className="text-gray-400 text-center text-sm py-2">
                    No users match your search
                  </p>
                ) : (
                  <p className="text-gray-400 text-center text-sm py-2">
                    No users found
                  </p>
                )
              ) : (
                <div className="space-y-4">
                  {/* Online Users */}
                  {filteredUsers.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                        Online
                      </div>
                      <ul className="space-y-2">
                        {filteredUsers.map((user) => (
                          <li
                            key={user.id}
                            className={`flex items-center px-3 py-2 cursor-pointer transition-colors ${
                              user.id === userId
                                ? "bg-orange-600/20 border-l-2 border-orange-500"
                                : user.id === directMessageRecipient
                                ? "bg-orange-600/10 border-l-2 border-orange-400"
                                : "hover:bg-gray-800/50"
                            }`}
                            onClick={() =>
                              user.id !== userId && selectRecipient(user.id)
                            }
                          >
                            <div className="h-7 w-7 flex items-center justify-center text-sm bg-gradient-to-br from-orange-500/30 to-orange-600/30 mr-2">
                              {(
                                (user.username || user.id || "?").charAt(0) ||
                                "?"
                              ).toUpperCase()}
                            </div>
                            <span className="text-sm truncate font-medium">
                              {user.username || user.id}{" "}
                              {user.id === userId && "(You)"}
                            </span>
                            {/* Status indicator */}
                            <div className="ml-auto w-2 h-2 bg-green-500"></div>
                            {/* Unread message notification badge */}
                            {user.id !== userId &&
                              unreadMessages[user.id] > 0 && (
                                <span className="ml-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5">
                                  {unreadMessages[user.id]}
                                </span>
                              )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Offline Users */}
                  {filteredOfflineUsers.length > 0 && (
                    <div>
                      <div className="px-2 py-1 text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                        Offline
                      </div>
                      <ul className="space-y-2">
                        {filteredOfflineUsers.map((user) => (
                          <li
                            key={user.id}
                            className={`flex items-center px-3 py-2 cursor-pointer transition-colors opacity-60 ${
                              user.id === directMessageRecipient
                                ? "bg-gray-800/30 border-l-2 border-gray-500"
                                : "hover:bg-gray-800/30"
                            }`}
                            onClick={() => selectRecipient(user.id)}
                          >
                            <div className="h-7 w-7 flex items-center justify-center text-sm bg-gradient-to-br from-gray-500/30 to-gray-600/30 mr-2">
                              {(
                                (user.username || user.id || "?").charAt(0) ||
                                "?"
                              ).toUpperCase()}
                            </div>
                            <span className="text-sm truncate font-medium text-gray-400">
                              {user.username || user.id}
                            </span>
                            {/* Unread message notification badge */}
                            {unreadMessages[user.id] > 0 && (
                              <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5">
                                {unreadMessages[user.id]}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-col flex-grow h-full overflow-hidden">
        {/* Chat Header */}
        <div className="bg-gray-900 text-white p-4 flex justify-between items-center flex-shrink-0 border-b border-gray-700/50 shadow-sm">
          <h1 className="text-xl font-bold">
            {activeTab === "global"
              ? "Global Chat"
              : activeTab === "direct" && directMessageRecipient
              ? `Chat with ${
                  onlineUsers.find((user) => user.id === directMessageRecipient)
                    ?.username || directMessageRecipient
                }`
              : activeTab === "room" && activeRoom
              ? `Room: ${
                  availableRooms.find((room) => room.id === activeRoom)?.name ||
                  activeRoom
                }`
              : "Game Chat"}
          </h1>
          <p className="text-gray-400">
            Logged in as:{" "}
            <span className="text-orange-300 font-medium">{username}</span>{" "}
          </p>
          <div className="flex gap-2">
            {!sidebarVisible && (
              <Button
                variant={"outline"}
                className="px-4 py-2 bg-gray-800 border-gray-600 text-white hover:bg-gray-700 transition-colors"
                onClick={() => setSidebarVisible(true)}
              >
                Show Users
              </Button>
            )}
            <Button
              variant={"destructive"}
              className="bg-red-600 hover:bg-red-700 transition-colors"
              onClick={() => {
                setIsUsernameSet(false);
                setUsername("");
                setUserId(initialUserId);
                setUserToken(initialToken);
                setChatClient(null);
                setMessages([]);
                setActiveTab("global");
                setUnreadMessages({});
              }}
            >
              Logout
            </Button>
          </div>
        </div>

        {/* Messages display */}
        <div
          className={`flex-1 overflow-y-auto p-4 flex flex-col bg-gradient-to-b from-gray-950 to-gray-900`}
          ref={chatContainerRef}
        >
          {filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 mb-2 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <>
              {/* Spacer to push content to bottom when there are few messages */}
              <div className="flex-grow" />

              <div className="space-y-6 pb-2">
                {messageGroups.map((group, groupIndex) => {
                  // Create a unique key based on the group's first message id and index
                  const groupKey = `${
                    group.messages[0]?.id || "empty"
                  }-${groupIndex}`;
                  return (
                    <MessageGroup
                      key={groupKey}
                      group={group}
                      userId={userId}
                      selectRecipient={selectRecipient}
                    />
                  );
                })}
                {/* Always keep the scroll anchor at the end of the content */}
                <div
                  ref={messagesEndRef}
                  style={{ height: "20px", clear: "both" }}
                />
              </div>
            </>
          )}
        </div>

        {/* Message input */}
        <MessageInput onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
}

export default App;
