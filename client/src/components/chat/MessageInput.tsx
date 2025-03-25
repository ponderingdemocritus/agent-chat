import React, { useState } from "react";

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
        className="p-2 md:p-3 border-t border-gray-900/30 flex-shrink-0 rounded bg-transparent"
      >
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 p-2 border bg-gray-900 rounded border-gray-700 text-white focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm md:text-base"
          />
          <button
            type="submit"
            className="px-3 md:px-6 py-2 bg-orange-600 text-white hover:bg-orange-700 transition-colors text-sm md:text-base rounded"
          >
            Send
          </button>
        </div>
      </form>
    );
  }
);

export default MessageInput;
