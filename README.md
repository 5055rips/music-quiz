# Music Quiz Game

A real-time multiplayer music guessing game with synchronized video playback.

## Features

- 🎵 Room-based multiplayer (no login required)
- 🎮 Host controls video playback - all players sync automatically
- 📝 Players submit guesses in real-time
- ✅ Host reviews and marks guesses as correct/incorrect
- 🏆 Live scoreboard with persistent scores across rounds
- 🔄 Automatic host rotation after each round
- 🔗 Invite links for easy room sharing
- 📱 Responsive design for mobile and desktop

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express + Socket.io
- **Real-time:** Socket.io for WebSocket communication
- **Video:** YouTube IFrame API

## Getting Started Locally

### 1. Install Dependencies

**Server:**
```bash
cd server
npm install
```

**Client:**
```bash
cd client
npm install
```

### 2. Run the Application

**Start the server (port 3001):**
```bash
cd server
node index.js
```

**Start the client (port 3002):**
```bash
cd client
npm run dev
```

**Access the app:**
Open `http://localhost:3002` in your browser

## How to Play

1. **Create a Room:** Enter your nickname and click "Create New Room"
2. **Invite Friends:** Share the invite link or room code with others
3. **Host Selects Song:** The host pastes a YouTube URL
4. **Play & Guess:** Host plays the video, players submit their guesses
5. **Review Answers:** Host marks each guess as correct or wrong
6. **Next Round:** Host clicks "Next Round" to pass hosting to the next player
7. **Keep Playing:** Scores accumulate across all rounds!

## Deployment

### Server (Backend)
Deploy to any Node.js hosting service (Render, Railway, Heroku, etc.)

**Environment Variables:**
- `PORT` - Server port (default: 3001)
- `CLIENT_URL` - Your frontend URL for CORS (e.g., https://your-app.vercel.app)

### Client (Frontend)
Deploy to Vercel, Netlify, or any static hosting service

**Update Socket Connection:**
In `client/app/room/[code]/page.tsx`, change:
```typescript
const newSocket = io('http://localhost:3001', {
```
to:
```typescript
const newSocket = io('https://your-server-url.com', {
```

## Project Structure

```
music-quiz/
├── client/          # Next.js frontend
│   ├── app/         # App router pages
│   └── package.json
├── server/          # Express + Socket.io backend
│   ├── index.js     # Main server file
│   └── package.json
└── README.md
```

## License

MIT
