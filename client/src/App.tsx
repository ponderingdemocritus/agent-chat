import { useState, useEffect, useRef } from "react";
import ChatClient from "./chat";
import "./App.css";
import { Button } from "./components/ui/button";

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

function App() {
  // User state
  const [userId, setUserId] = useState<string>(initialUserId);
  const [userToken, setUserToken] = useState<string>(initialToken);
  const [username, setUsername] = useState<string>("");
  const [isUsernameSet, setIsUsernameSet] = useState<boolean>(false);

  // Chat state
  const [chatClient, setChatClient] = useState<ChatClient | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"global" | "direct" | "room">(
    "global"
  );
  const [directMessageRecipient, setDirectMessageRecipient] = useState("");
  const [activeRoom, setActiveRoom] = useState("");
  const [newRoomId, setNewRoomId] = useState("");

  // Online users state
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Unread messages state - track unread messages by user ID
  const [unreadMessages, setUnreadMessages] = useState<Record<string, number>>(
    {}
  );

  // Auto-scroll to bottom of messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Reference for top of messages (for global chat)
  const messagesTopRef = useRef<HTMLDivElement>(null);

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

    const client = new ChatClient(userToken, username);
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

    // Handle available rooms updates
    const handleAvailableRooms = (rooms: Room[]) => {
      console.log("Received available rooms:", JSON.stringify(rooms));
      console.log(
        "Room IDs:",
        rooms.map((room) => room.id)
      );
      console.log(
        "Current state of availableRooms:",
        JSON.stringify(availableRooms)
      );
      console.log(
        "Room IDs in current state:",
        availableRooms.map((room) => room.id)
      );
      setAvailableRooms(rooms);
    };

    // Override the console.log implementations in ChatClient with our UI handlers
    client.socket.on("directMessage", handleDirectMessage);
    client.socket.on("roomMessage", handleRoomMessage);
    client.socket.on("globalMessage", handleGlobalMessage);
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

    // Add handler for direct message history
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

          console.log("Formatted messages:", formattedMessages);

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

    // Handle online users updates
    client.socket.on("onlineUsers", handleOnlineUsers);

    // Handle available rooms updates
    client.socket.on("availableRooms", handleAvailableRooms);

    // Add handler for room history
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

        console.log("Formatted room messages:", formattedMessages);

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

    // Manually request online users and available rooms
    client.getOnlineUsers();
    client.getRooms();

    // Set up an interval to periodically request online users and rooms
    const updateInterval = setInterval(() => {
      if (client) {
        client.getOnlineUsers();
        client.getRooms();
      }
    }, 10000); // Request every 10 seconds

    return () => {
      // Clean up event listeners
      client.socket.off("directMessage", handleDirectMessage);
      client.socket.off("roomMessage", handleRoomMessage);
      client.socket.off("globalMessage", handleGlobalMessage);
      client.socket.off("globalHistory");
      client.socket.off("directMessageHistory");
      client.socket.off("roomHistory");
      client.socket.off("onlineUsers", handleOnlineUsers);
      client.socket.off("availableRooms", handleAvailableRooms);

      // Clear interval
      clearInterval(updateInterval);
    };
  }, [userToken, username, isUsernameSet]);

  // Auto-scroll when messages change
  useEffect(() => {
    // For global chat, scroll to top (latest messages)
    if (activeTab === "global") {
      messagesTopRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      // For direct messages and rooms, scroll to bottom
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  // Add a message to the state
  const addMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  // Send a message based on active tab
  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatClient) return;

    switch (activeTab) {
      case "global":
        chatClient.sendGlobalMessage(newMessage);
        break;
      case "direct":
        if (directMessageRecipient) {
          chatClient.sendDirectMessage(directMessageRecipient, newMessage);
          // Add to our local messages for immediate feedback
          addMessage({
            id: Date.now().toString(),
            senderId: userId,
            senderUsername: username,
            recipientId: directMessageRecipient,
            message: newMessage,
            timestamp: new Date(),
            type: "direct",
          });
        }
        break;
      case "room":
        if (activeRoom) {
          chatClient.sendRoomMessage(activeRoom, newMessage);
        }
        break;
    }

    setNewMessage("");
  };

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

  // Set direct message recipient from online users list
  const selectRecipient = (userId: string) => {
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
  };

  // If username is not set, show username form
  if (!isUsernameSet) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-black text-white">
        <h1 className="text-2xl font-bold mb-4">Welcome to Game Chat</h1>
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
            className="px-4 py-2 mb-3 border rounded w-64 bg-gray-800 border-gray-900 text-white"
          />
          <Button variant={"default"} type="submit">
            Join Chat
          </Button>
        </form>
      </div>
    );
  }

  // Filter messages based on active tab
  const filteredMessages = messages.filter((msg) => {
    if (activeTab === "global") return msg.type === "global";
    if (activeTab === "direct") {
      // Only show direct messages that involve the current user and the selected recipient
      const isRelevantMessage =
        msg.type === "direct" &&
        ((msg.senderId === userId &&
          msg.recipientId === directMessageRecipient) ||
          (msg.senderId === directMessageRecipient &&
            (msg.recipientId === userId || msg.recipientId === undefined)));

      // Debug logging
      console.log(
        `Filtering DM: ${msg.senderId} -> ${msg.recipientId}, relevant: ${isRelevantMessage}`
      );
      console.log(
        `Current user: ${userId}, Selected recipient: ${directMessageRecipient}`
      );

      return isRelevantMessage;
    }
    if (activeTab === "room")
      return msg.type === "room" && msg.roomId === activeRoom;
    return false;
  });

  // Sort messages based on active tab
  const sortedMessages = [...filteredMessages].sort((a, b) => {
    // For global chat, reverse order (newest first)
    if (activeTab === "global") {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }
    // For direct messages and rooms, keep chronological order (oldest first)
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black text-gray-200">
      {/* Online Users Sidebar */}
      {sidebarVisible && (
        <div className="w-64 h-full bg-black text-gray-200 p-4 shadow-lg flex-shrink-0 flex flex-col border-r border-gray-900">
          {/* Rooms Section */}
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4">Rooms</h2>
            <div className="overflow-y-auto">
              {availableRooms.length === 0 ? (
                <p className="text-gray-400 text-center">No active rooms</p>
              ) : (
                <ul className="space-y-1">
                  {/* Debug logging */}
                  {(() => {
                    console.log("Rendering rooms:", availableRooms);
                    return null;
                  })()}
                  {availableRooms.map((room) => {
                    console.log("Rendering room:", room);
                    return (
                      <li
                        key={room.id}
                        className={`flex items-center px-2 rounded cursor-pointer hover:bg-gray-700 ${
                          room.id === activeRoom ? "bg-gray-700" : ""
                        }`}
                        onClick={() => joinRoomFromSidebar(room.id)}
                      >
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                        <span className="text-sm truncate">
                          {room.name || room.id}
                        </span>
                        {room.userCount && (
                          <span className="bg-gray-600 px-2 py-0.5 rounded-full text-xs">
                            {room.userCount}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <form onSubmit={joinRoom} className="mt-2 flex space-x-1">
              <input
                type="text"
                placeholder="Join or Create"
                value={newRoomId}
                onChange={(e) => setNewRoomId(e.target.value)}
                className="flex-1 p-1 text-sm border rounded bg-gray-800 border-gray-900 text-white"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
              >
                +
              </button>
            </form>
          </div>

          {/* Users Section */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Online Users</h2>
            <span className="bg-green-600 px-3 py-1 rounded-full text-sm">
              {onlineUsers.length}
            </span>
            <button
              className="text-2xl hover:text-gray-400"
              onClick={() => setSidebarVisible(false)}
            >
              &times;
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {onlineUsers.length === 0 ? (
              <p className="text-gray-400 text-center">No users online</p>
            ) : (
              <ul className="space-y-2">
                {onlineUsers.map((user) => (
                  <li
                    key={user.id}
                    className={`flex items-center px-2 rounded cursor-pointer hover:bg-gray-700 ${
                      user.id === userId ? "bg-gray-700" : ""
                    }`}
                    onClick={() =>
                      user.id !== userId && selectRecipient(user.id)
                    }
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-sm truncate">
                      {user.username} {user.id === userId && "(You)"}
                    </span>
                    {/* Unread message notification badge */}
                    {user.id !== userId && unreadMessages[user.id] > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {unreadMessages[user.id]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-col flex-grow h-full overflow-hidden">
        <div className="bg-black text-white p-4 flex justify-between items-center flex-shrink-0 border-b border-gray-900">
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
            Logged in as: <span className="text-gray-200">{username}</span>{" "}
          </p>
          <Button
            variant={"destructive"}
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
          {!sidebarVisible && (
            <button
              className="px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-700"
              onClick={() => setSidebarVisible(true)}
            >
              Show Users
            </button>
          )}
        </div>

        {/* Messages display */}
        <div
          className={`flex-1 overflow-y-auto p-4  ${
            activeTab === "global" ? "flex flex-col-reverse" : "flex flex-col"
          } bg-black`}
        >
          {activeTab === "global" && <div ref={messagesTopRef} />}
          {filteredMessages.length === 0 ? (
            <p className="text-center text-gray-500">No messages yet</p>
          ) : (
            <div
              className={`space-y-6 ${
                activeTab !== "global" ? "flex flex-col-reverse" : ""
              }`}
            >
              {sortedMessages
                .reduce(
                  (
                    groups: Array<{
                      senderId: string;
                      senderUsername?: string;
                      messages: Message[];
                    }>,
                    msg
                  ) => {
                    // Get the last group or create a new one if none exists
                    const lastGroup =
                      groups.length > 0 ? groups[groups.length - 1] : null;

                    // Check if this is a new sender or if there's a significant time gap (5+ minutes)
                    const timeDiff = lastGroup
                      ? Math.abs(
                          new Date(msg.timestamp).getTime() -
                            new Date(
                              lastGroup.messages[
                                lastGroup.messages.length - 1
                              ].timestamp
                            ).getTime()
                        )
                      : Infinity;
                    const isNewTimeGroup = timeDiff > 5 * 60 * 1000; // 5 minutes

                    // Always create a new group for short messages like "hey"
                    const isShortMessage =
                      msg.message.trim().split(/\s+/).length <= 1;

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
                )
                .map((group, groupIndex) => (
                  <div key={`group-${groupIndex}`} className="message-group">
                    {/* Sender info for the group */}
                    <div className="flex items-center mb-2">
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center ${
                          group.senderId === userId
                            ? "bg-indigo-600/30"
                            : "bg-green-700/30"
                        } mr-2`}
                      >
                        {(group.senderUsername || group.senderId)
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <span className=" text-gray-300/40 text-sm">
                        {group.senderId === userId
                          ? "You"
                          : group.senderUsername || group.senderId}
                      </span>
                      <span className="text-xs text-gray-500 ml-2 align-bottom">
                        {new Date(
                          group.messages[0].timestamp
                        ).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Messages from this sender */}
                    <div className="pl-8 space-y-1">
                      {group.messages.map((msg, msgIndex) => (
                        <div key={msg.id} className="flex flex-col">
                          <div
                            className={`rounded-lg  px-3 inline-block ${
                              msg.senderId === userId
                                ? " text-white"
                                : " text-gray-200"
                            }`}
                          >
                            {msg.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
          {activeTab !== "global" && <div ref={messagesEndRef} />}
        </div>

        {/* Message input */}
        <form
          onSubmit={sendMessage}
          className="p-3 border-t border-gray-900 flex-shrink-0 bg-black"
        >
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 p-2 border rounded bg-black border-gray-900 text-white"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
