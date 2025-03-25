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
    <div className="w-full h-screen flex flex-col items-center justify-center bg-gradient-to-r from-indigo-900 via-purple-900 to-orange-900 text-white p-4 animate-gradient-bg bg-[length:400%_400%]">
      <div className="p-6 md:p-8 w-full max-w-md mx-auto">
        <h1 className="text-2xl md:text-3xl mb-6 text-center">Enter</h1>
        <form onSubmit={handleSubmit} className="flex flex-col items-center">
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="px-4 py-3 mb-4 border w-full  border-gray-900/40 rounded text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <Button variant={"default"} type="submit">
            Join Chat
          </Button>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
