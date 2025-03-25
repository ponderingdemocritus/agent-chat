import { Message, Room, User } from "../types";

// Filter messages based on active tab, user ID, and recipient
export const filterMessages = (
  messages: Message[],
  activeTab: "global" | "direct" | "room",
  userId: string,
  directMessageRecipient: string,
  activeRoom: string
): Message[] => {
  return messages.filter((msg) => {
    if (activeTab === "global") return msg.type === "global";
    if (activeTab === "direct") {
      // Only show direct messages that involve the current user and the selected recipient
      return (
        msg.type === "direct" &&
        ((msg.senderId === userId &&
          msg.recipientId === directMessageRecipient) ||
          (msg.senderId === directMessageRecipient &&
            (msg.recipientId === userId || msg.recipientId === undefined)))
      );
    }
    if (activeTab === "room")
      return msg.type === "room" && msg.roomId === activeRoom;
    return false;
  });
};

// Sort messages by timestamp
export const sortMessagesByTime = (messages: Message[]): Message[] => {
  return [...messages].sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
};

// Filter rooms based on search input
export const filterRoomsBySearch = (
  rooms: Room[],
  searchText: string
): Room[] => {
  if (!searchText.trim()) return rooms;

  return rooms.filter((room) =>
    (room.name || room.id).toLowerCase().includes(searchText.toLowerCase())
  );
};

// Filter users based on search input
export const filterUsersBySearch = (
  users: User[],
  searchText: string
): User[] => {
  if (!searchText.trim()) return users;

  return users.filter((user) =>
    (user.username || user.id).toLowerCase().includes(searchText.toLowerCase())
  );
};
