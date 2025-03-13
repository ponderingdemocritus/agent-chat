import { useState, useEffect, useRef } from "react";
import ChatClient from "./chat";
import "./App.css";
import { Button } from "./components/ui/button";

// Function to generate a random user ID and token
// const generateRandomUser = () => {
//   const randomId = Math.floor(Math.random() * 10000)
//     .toString()
//     .padStart(4, "0");
//   const userId = `user${randomId}`;
//   const token = `${userId}-jwt-token-${Math.random()
//     .toString(36)
//     .substring(2, 10)}`;
//   return { userId, token };
// };

// // Generate random user on initial load
// const { userId: initialUserId, token: initialToken } = generateRandomUser();

const initialUserId = "1231231231231";
const initialToken = "1231231231231-jwt-token-1231231231231";

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

function App() {
  // User state
  const [userId] = useState<string>(initialUserId);
  const [userToken] = useState<string>(initialToken);
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
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Auto-scroll to bottom of messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Reference for top of messages (for global chat)
  const messagesTopRef = useRef<HTMLDivElement>(null);

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
        }
      }
    );

    // Handle online users updates
    client.socket.on("onlineUsers", handleOnlineUsers);

    // Manually request online users
    client.getOnlineUsers();

    // Set up an interval to periodically request online users
    const onlineUsersInterval = setInterval(() => {
      if (client) {
        client.getOnlineUsers();
      }
    }, 10000); // Request every 10 seconds

    return () => {
      // Clean up event listeners
      client.socket.off("directMessage", handleDirectMessage);
      client.socket.off("roomMessage", handleRoomMessage);
      client.socket.off("globalMessage", handleGlobalMessage);
      client.socket.off("globalHistory");
      client.socket.off("onlineUsers", handleOnlineUsers);

      // Clear interval
      clearInterval(onlineUsersInterval);
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
    setNewRoomId("");
  };

  // Set direct message recipient from online users list
  const selectRecipient = (userId: string) => {
    console.log(`Selecting recipient: ${userId}`);
    setDirectMessageRecipient(userId);
    setActiveTab("direct");
    setShowOnlineUsers(false);

    // Request message history with this user
    if (chatClient) {
      console.log(`Requesting direct message history with ${userId}`);
      chatClient.getDirectMessageHistory(userId);
    }
  };

  // Handle username submission
  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setIsUsernameSet(true);
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
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Online Users</h2>
            <span className="bg-green-600 px-2 py-1 rounded-full text-sm">
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
                    className={`flex items-center p-2 rounded cursor-pointer hover:bg-gray-700 ${
                      user.id === userId ? "bg-gray-700" : ""
                    }`}
                    onClick={() =>
                      user.id !== userId && selectRecipient(user.id)
                    }
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span>
                      {user.username} {user.id === userId && "(You)"}
                    </span>
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
          <h1 className="text-xl font-bold">Game Chat</h1>
          {!sidebarVisible && (
            <button
              className="px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-700"
              onClick={() => setSidebarVisible(true)}
            >
              Show Users
            </button>
          )}
        </div>

        {/* Chat tabs */}
        <div className="flex border-b border-gray-900 flex-shrink-0 bg-black">
          <button
            className={`px-4 py-2 ${
              activeTab === "global"
                ? "border-b-2 border-indigo-500 text-indigo-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
            onClick={() => {
              setActiveTab("global");
              if (directMessageRecipient) setDirectMessageRecipient("");
            }}
          >
            Global
          </button>
          <button
            className={`px-4 py-2 ${
              activeTab === "direct"
                ? "border-b-2 border-indigo-500 text-indigo-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
            onClick={() => setActiveTab("direct")}
          >
            Direct Messages
          </button>
          <button
            className={`px-4 py-2 ${
              activeTab === "room"
                ? "border-b-2 border-indigo-500 text-indigo-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
            onClick={() => {
              setActiveTab("room");
              if (directMessageRecipient) setDirectMessageRecipient("");
            }}
          >
            Rooms
          </button>
        </div>

        {/* Tab-specific controls */}
        {activeTab === "direct" && (
          <div className=" border-b border-gray-900 flex-shrink-0 bg-black">
            {/* <input
              type="text"
              placeholder="Recipient User ID"
              value={directMessageRecipient}
              onChange={(e) => setDirectMessageRecipient(e.target.value)}
              onBlur={() => {
                if (directMessageRecipient && chatClient) {
                  chatClient.getDirectMessageHistory(directMessageRecipient);
                }
              }}
              className="w-full p-2 border rounded bg-black border-gray-900 text-white"
            /> */}
            {/* {!sidebarVisible && (
              <button
                className="mt-2 px-4 py-2 bg-black rounded hover:bg-gray-600 text-gray-200"
                onClick={() => setShowOnlineUsers(!showOnlineUsers)}
              >
                {showOnlineUsers ? "Hide Online Users" : "Show Online Users"}
              </button>
            )} */}

            {/* {directMessageRecipient && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-gray-300">
                  Chatting with: <strong>{directMessageRecipient}</strong>
                </p>
                <div className="space-x-2">
                  <Button
                    variant={"destructive"}
                    onClick={() => setDirectMessageRecipient("")}
                  >
                    Clear
                  </Button>
                  <Button
                    variant={"default"}
                    onClick={() => {
                      if (chatClient && directMessageRecipient) {
                        chatClient.getDirectMessageHistory(
                          directMessageRecipient
                        );
                      }
                    }}
                  >
                    Refresh History
                  </Button>
                </div>
              </div>
            )} */}

            {/* Online Users Dropdown */}
            {/* {sidebarVisible && (
              <div className="mt-4 p-4 bg-black rounded shadow-lg max-h-60 overflow-y-auto border border-gray-900">
                <h3 className="text-lg font-semibold mb-2 text-gray-200">
                  Online Users ({onlineUsers.length})
                </h3>
                {onlineUsers.length === 0 ? (
                  <p className="text-gray-400">No users online</p>
                ) : (
                  <ul className="space-y-2">
                    {onlineUsers.map((user) => (
                      <li
                        key={user.id}
                        onClick={() => selectRecipient(user.id)}
                        className="p-2 hover:bg-gray-600 cursor-pointer rounded text-gray-200"
                      >
                        {user.username} {user.id === userId && "(You)"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )} */}
          </div>
        )}

        {activeTab === "room" && (
          <div className="p-4 border-b border-gray-900 flex-shrink-0 bg-black">
            {activeRoom ? (
              <div className="flex items-center justify-between">
                <p className="text-gray-300">Current Room: {activeRoom}</p>
                <button
                  onClick={() => setActiveRoom("")}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Leave Room
                </button>
              </div>
            ) : (
              <form onSubmit={joinRoom} className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Room ID"
                  value={newRoomId}
                  onChange={(e) => setNewRoomId(e.target.value)}
                  className="flex-1 p-2 border rounded bg-gray-700 border-gray-900 text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Join Room
                </button>
              </form>
            )}
          </div>
        )}

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

                          {/* Only show timestamp for the last message if there are multiple messages */}
                          {/* {msgIndex === group.messages.length - 1 &&
                            group.messages.length > 1 && (
                              <span className="text-xs text-gray-500 mt-1 ml-1">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                              </span>
                            )} */}
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

        {/* User info */}
        <div className="p-3 bg-black border-t border-gray-900 flex-shrink-0 text-sm">
          <p className="text-gray-400">
            Logged in as: <span className="text-gray-200">{userId}</span>{" "}
            <span className="text-xs text-gray-500">
              (Use this ID for direct messages from other windows)
            </span>
          </p>
          {/* {chatClient && (
            <button
              className="mt-2 px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 text-gray-300 text-sm"
              onClick={() => {
                chatClient.debug("messageCounts");
                if (activeTab === "direct" && directMessageRecipient) {
                  chatClient.debug("directMessages", {
                    otherUserId: directMessageRecipient,
                  });
                  console.log("Current messages in state:", messages);
                  console.log("Filtered messages:", filteredMessages);
                  const relevantMessages = messages.filter(
                    (msg) =>
                      msg.type === "direct" &&
                      (msg.senderId === directMessageRecipient ||
                        msg.recipientId === directMessageRecipient)
                  );
                  console.log(
                    "Messages with this recipient:",
                    relevantMessages
                  );
                }
              }}
            >
              Debug Messages
            </button>
          )} */}
        </div>
      </div>
    </div>
  );
}

export default App;
