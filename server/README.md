# Chat Server with Supabase Persistence

This is a real-time chat server built with Socket.IO and Supabase for data persistence.

## Features

- Real-time messaging with Socket.IO
- Global chat room
- Direct messaging between users
- Custom chat rooms
- Online user tracking
- Message history persistence with Supabase
- Authentication support

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm or pnpm
- Supabase account (free tier works fine)

### Supabase Setup

1. Create a new Supabase project at [https://supabase.com](https://supabase.com)
2. Get your Supabase URL and anon key from the project settings
3. Run the SQL script in `supabase/schema.sql` in the Supabase SQL editor to create the necessary tables and policies

#### Important Note on Row Level Security (RLS)

The schema includes Row Level Security policies that allow the server to perform operations using the anon key. In a production environment, you should:

- Consider using a service role key instead of the anon key for server operations
- Implement proper authentication for client-side operations
- Adjust the RLS policies to match your security requirements

### Environment Setup

1. Copy `.env.example` to `.env`
2. Fill in your Supabase credentials:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### Installation

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

## API Documentation

### Socket.IO Events

#### Authentication

- Connect with authentication token: `socket.connect({ auth: { token: 'your-auth-token' } })`

#### Global Chat

- Send message: `socket.emit('globalMessage', { message: 'Hello world' })`
- Receive messages: `socket.on('globalMessage', (data) => { ... })`
- Get history: Automatically sent on connection

#### Direct Messages

- Send message: `socket.emit('directMessage', { recipientId: 'user123', message: 'Hello' })`
- Receive messages: `socket.on('directMessage', (data) => { ... })`
- Get history: `socket.emit('getDirectMessageHistory', { otherUserId: 'user123' })`

#### Rooms

- Join room: `socket.emit('joinRoom', { roomId: 'room1' })`
- Leave room: `socket.emit('leaveRoom', { roomId: 'room1' })`
- Send message: `socket.emit('roomMessage', { roomId: 'room1', message: 'Hello room' })`
- Get history: `socket.emit('getRoomHistory', { roomId: 'room1' })`

#### User Status

- Get online users: `socket.emit('getOnlineUsers')`
- Receive online users: `socket.on('onlineUsers', (users) => { ... })`
- User went offline: `socket.on('userOffline', (data) => { ... })`

## Docker Support

The server is configured to run in Docker and listens on all interfaces (0.0.0.0) on port 3000.
