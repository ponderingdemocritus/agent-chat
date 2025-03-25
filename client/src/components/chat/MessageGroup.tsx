import React from "react";
import { MessageGroup } from "../../types";

// MessageGroup component for better performance
const MessageGroupComponent = React.memo(
  ({
    group,
    userId,
    selectRecipient,
  }: {
    group: MessageGroup;
    userId: string;
    selectRecipient: (userId: string) => void;
  }) => {
    return (
      <div className="message-group">
        {/* Sender info for the group */}
        <div className="flex items-center">
          <div
            className={`h-5 w-5 md:h-6 md:w-6 flex items-center justify-center text-xs md:text-sm rounded ${
              group.senderId === userId ? "bg-orange-600/40" : "bg-green-600/40"
            } mr-1.5 md:mr-2`}
          >
            {(group.senderUsername || group.senderId).charAt(0).toUpperCase()}
          </div>
          <span
            className={`text-xs md:text-sm font-medium ${
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
            {new Date(group.messages[0].timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* Messages from this sender */}
        <div className="pl-6 md:pl-7 space-y-1 md:space-y-1.5 mt-1">
          {group.messages.map((msg) => (
            <div key={msg.id} className="flex flex-col">
              <div
                className={`px-2 md:px-3 py-1.5 md:py-2 inline-block max-w-[90%] md:max-w-[85%] rounded text-sm md:text-base ${
                  msg.senderId === userId
                    ? "bg-orange-600/5 text-white"
                    : "bg-gray-700/20 text-gray-100"
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

export default MessageGroupComponent;
