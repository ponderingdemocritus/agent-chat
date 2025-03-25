import React, { useState } from "react";
import { Button } from "../ui/button";

interface LoginFormProps {
  onLogin: (username: string) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [username, setUsername] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    onLogin(username);
  };

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black text-white p-4">
      <div className="bg-gray-800/50 p-6 md:p-8 border border-gray-700/50 backdrop-blur-sm w-full max-w-md mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-orange-700">
          Welcome to Eternum Chat
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col items-center">
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="px-4 py-3 mb-4 border w-full bg-gray-700/60 border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
};

export default LoginForm;
