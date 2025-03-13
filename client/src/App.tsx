import { useState, useEffect, useRef } from "react";
import ChatClient from "./chat";
import "./App.css";

// Function to generate a random user ID and token
const generateRandomUser = () => {
  const randomId = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  const userId = `user${randomId}`;
  const token = `${userId}-jwt-token-${Math.random()
    .toString(36)
    .substring(2, 10)}`;
  return { userId, token };
};

// Generate random user on initial load
const { userId: initialUserId, token: initialToken } = generateRandomUser();

// Message type definition
interface Message {
  id: string;
  senderId: string;
  message: string;
  timestamp: Date;
  type: "direct" | "room" | "global";
  roomId?: string;
  recipientId?: string;
}

function App() {
  // User state
  const [userId] = useState<string>(initialUserId);
  const [userToken] = useState<string>(initialToken);

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
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Auto-scroll to bottom of messages
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize chat client
  useEffect(() => {
    const client = new ChatClient(userToken);
    setChatClient(client);

    // Custom event listeners for our UI
    const handleDirectMessage = ({ senderId, message, timestamp }: any) => {
      addMessage({
        id: Date.now().toString(),
        senderId,
        recipientId: userId,
        message,
        timestamp: timestamp || new Date(),
        type: "direct",
      });
    };

    const handleRoomMessage = ({
      senderId,
      roomId,
      message,
      timestamp,
    }: any) => {
      addMessage({
        id: Date.now().toString(),
        senderId,
        message,
        timestamp: timestamp || new Date(),
        type: "room",
        roomId,
      });
    };

    const handleGlobalMessage = ({ senderId, message, timestamp }: any) => {
      addMessage({
        id: Date.now().toString(),
        senderId,
        message,
        timestamp: timestamp || new Date(),
        type: "global",
      });
    };

    // Handle online users updates
    const handleOnlineUsers = (users: string[]) => {
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
        senderId: msg.senderId,
        message: msg.message,
        timestamp: new Date(msg.timestamp),
        type: "global",
      }));
      setMessages((prev) => [...prev, ...historyMessages]);
    });

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
  }, [userToken]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    // Log current messages to help with debugging
    console.log(
      "Current messages:",
      messages.filter(
        (msg) =>
          msg.type === "direct" &&
          ((msg.senderId === userId &&
            msg.recipientId === directMessageRecipient) ||
            (msg.senderId === directMessageRecipient &&
              msg.recipientId === userId))
      )
    );
  };

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
            msg.recipientId === userId));

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

  return (
    <div className="chat-app-container">
      {/* Online Users Sidebar */}
      {sidebarVisible && (
        <div className="online-users-sidebar">
          <div className="sidebar-header">
            <h2>Online Users</h2>
            <span className="online-count">{onlineUsers.length}</span>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarVisible(false)}
            >
              &times;
            </button>
          </div>
          <div className="sidebar-content">
            {onlineUsers.length === 0 ? (
              <p className="no-users">No users online</p>
            ) : (
              <ul className="users-list">
                {onlineUsers.map((user) => (
                  <li
                    key={user}
                    className={`user-item ${
                      user === userId ? "current-user" : ""
                    }`}
                    onClick={() => user !== userId && selectRecipient(user)}
                  >
                    <div className="user-status"></div>
                    <span>
                      {user} {user === userId && "(You)"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className={`chat-app ${!sidebarVisible ? "full-width" : ""}`}>
        <div className="chat-header">
          <h1>Game Chat</h1>
          {!sidebarVisible && (
            <button
              className="sidebar-toggle-show"
              onClick={() => setSidebarVisible(true)}
            >
              Show Users
            </button>
          )}
        </div>

        {/* Chat tabs */}
        <div className="chat-tabs">
          <button
            className={activeTab === "global" ? "active" : ""}
            onClick={() => {
              setActiveTab("global");
              if (directMessageRecipient) setDirectMessageRecipient("");
            }}
          >
            Global
          </button>
          <button
            className={activeTab === "direct" ? "active" : ""}
            onClick={() => setActiveTab("direct")}
          >
            Direct Messages
          </button>
          <button
            className={activeTab === "room" ? "active" : ""}
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
          <div className="recipient-input">
            <input
              type="text"
              placeholder="Recipient User ID"
              value={directMessageRecipient}
              onChange={(e) => setDirectMessageRecipient(e.target.value)}
            />
            {!sidebarVisible && (
              <button
                className="online-users-toggle"
                onClick={() => setShowOnlineUsers(!showOnlineUsers)}
              >
                {showOnlineUsers ? "Hide Online Users" : "Show Online Users"}
              </button>
            )}

            {directMessageRecipient && (
              <div className="active-recipient">
                <p>
                  Chatting with: <strong>{directMessageRecipient}</strong>
                </p>
                <button
                  className="clear-recipient"
                  onClick={() => setDirectMessageRecipient("")}
                >
                  Clear
                </button>
              </div>
            )}

            {/* Online Users Dropdown (only shown when sidebar is hidden) */}
            {showOnlineUsers && !sidebarVisible && (
              <div className="online-users-dropdown">
                <h3>Online Users ({onlineUsers.length})</h3>
                {onlineUsers.length === 0 ? (
                  <p>No users online</p>
                ) : (
                  <ul>
                    {onlineUsers.map((user) => (
                      <li key={user} onClick={() => selectRecipient(user)}>
                        {user} {user === userId && "(You)"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "room" && (
          <div className="room-controls">
            {activeRoom ? (
              <div className="active-room">
                <p>Current Room: {activeRoom}</p>
                <button onClick={() => setActiveRoom("")}>Leave Room</button>
              </div>
            ) : (
              <form onSubmit={joinRoom} className="join-room-form">
                <input
                  type="text"
                  placeholder="Room ID"
                  value={newRoomId}
                  onChange={(e) => setNewRoomId(e.target.value)}
                />
                <button type="submit">Join Room</button>
              </form>
            )}
          </div>
        )}

        {/* Messages display */}
        <div className="messages-container">
          {filteredMessages.length === 0 ? (
            <p className="no-messages">No messages yet</p>
          ) : (
            filteredMessages.map((msg) => (
              <div
                key={msg.id}
                className={`message ${
                  msg.senderId === userId ? "own-message" : ""
                }`}
              >
                <div className="message-header">
                  <span className="sender">
                    {msg.senderId === userId ? "You" : msg.senderId}
                  </span>
                  <span className="timestamp">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="message-content">{msg.message}</div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <form onSubmit={sendMessage} className="message-form">
          <input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <button type="submit">Send</button>
        </form>

        {/* User info */}
        <div className="user-info">
          <p>
            Logged in as: {userId}{" "}
            <span className="user-token-hint">
              (Use this ID for direct messages from other windows)
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
