import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3002",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3002",
  credentials: true
}));
app.use(express.json());

// In-memory game state
const rooms = new Map();

// Helper to extract YouTube video ID from URL
function extractYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room
  socket.on('join-room', ({ roomCode, nickname }) => {
    if (!roomCode || !nickname) {
      socket.emit('error', { message: 'Room code and nickname are required' });
      return;
    }

    let room = rooms.get(roomCode);
    
    // Create room if it doesn't exist
    if (!room) {
      room = {
        code: roomCode,
        players: [],
        currentHostIndex: 0,
        gameState: 'waiting', // waiting, playing
        currentVideo: null,
        videoState: 'paused', // paused, playing
        guesses: [],
        scores: new Map()
      };
      rooms.set(roomCode, room);
    }

    // Check if player with this nickname already exists (reconnecting)
    const existingPlayerByNickname = room.players.find(p => p.nickname === nickname);
    
    if (existingPlayerByNickname) {
      // Update socket ID for reconnecting player
      const oldId = existingPlayerByNickname.id;
      existingPlayerByNickname.id = socket.id;
      
      // Transfer score to new socket ID if it exists
      if (room.scores.has(oldId)) {
        const oldScore = room.scores.get(oldId);
        room.scores.delete(oldId);
        room.scores.set(socket.id, oldScore);
        console.log('Reconnected player:', nickname, 'with score:', oldScore);
      }
    } else {
      // New player
      const player = {
        id: socket.id,
        nickname: nickname,
        isHost: room.players.length === 0 // First player is host
      };
      room.players.push(player);
      room.scores.set(socket.id, 0);
      console.log('New player joined:', nickname);
    }

    socket.join(roomCode);
    
    // Update host if needed
    if (room.players.length > 0) {
      room.players.forEach((p, idx) => {
        p.isHost = idx === room.currentHostIndex;
      });
    }

    const isHost = room.players.find(p => p.id === socket.id)?.isHost || false;

    // Send current game state to the joining player
    socket.emit('room-joined', {
      roomCode,
      players: room.players,
      gameState: room.gameState,
      currentVideo: room.currentVideo,
      videoState: room.videoState,
      scores: Object.fromEntries(room.scores),
      isHost: isHost
    });

    // Notify all players in room
    io.to(roomCode).emit('player-joined', {
      players: room.players,
      scores: Object.fromEntries(room.scores)
    });
  });

  // Host submits video URL
  socket.on('host-submit-video', ({ roomCode, videoUrl }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error', { message: 'Only the host can submit videos' });
      return;
    }

    const videoId = extractYouTubeId(videoUrl);
    if (!videoId) {
      socket.emit('error', { message: 'Invalid YouTube URL' });
      return;
    }

    room.gameState = 'playing';
    room.currentVideo = {
      id: videoId,
      url: videoUrl
    };
    room.videoState = 'paused';
    room.guesses = [];

    // Notify all players
    io.to(roomCode).emit('video-loaded', {
      videoId: room.currentVideo.id,
      videoState: room.videoState
    });
  });

  // Host controls video playback
  socket.on('host-control-video', ({ roomCode, action }) => {
    console.log('Received host-control-video:', { roomCode, action, socketId: socket.id });
    const room = rooms.get(roomCode);
    if (!room) {
      console.log('Room not found:', roomCode);
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      console.log('Player not host:', { player, socketId: socket.id });
      socket.emit('error', { message: 'Only the host can control video' });
      return;
    }

    if (action === 'play' || action === 'pause') {
      room.videoState = action === 'play' ? 'playing' : 'paused';
      console.log('Broadcasting video-state-changed:', room.videoState, 'to room:', roomCode);
      // Broadcast to all players
      io.to(roomCode).emit('video-state-changed', {
        state: room.videoState
      });
      console.log('Broadcasted to', room.players.length, 'players');
    }
  });

  // Player submits guess
  socket.on('player-submit-guess', ({ roomCode, guess }) => {
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.gameState !== 'playing') {
      socket.emit('error', { message: 'No active round' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player) {
      socket.emit('error', { message: 'Player not in room' });
      return;
    }

    // Check if already guessed
    const existingGuess = room.guesses.find(g => g.playerId === socket.id);
    if (existingGuess) {
      socket.emit('error', { message: 'You already submitted a guess' });
      return;
    }

    const guessData = {
      playerId: socket.id,
      nickname: player.nickname,
      guess: guess.trim(),
      timestamp: Date.now(),
      isCorrect: null // null = pending, true = correct, false = incorrect
    };

    room.guesses.push(guessData);

    // Notify all players of the new guess
    io.to(roomCode).emit('guess-submitted', {
      guesses: room.guesses
    });
  });

  // Host marks guess as correct/incorrect
  socket.on('host-mark-guess', ({ roomCode, playerId, isCorrect }) => {
    console.log('Received host-mark-guess:', { roomCode, playerId, isCorrect });
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error', { message: 'Only the host can mark guesses' });
      return;
    }

    const guess = room.guesses.find(g => g.playerId === playerId);
    if (!guess) {
      socket.emit('error', { message: 'Guess not found' });
      return;
    }

    // Update guess status
    guess.isCorrect = isCorrect;

    // Update score if correct
    if (isCorrect) {
      const currentScore = room.scores.get(playerId) || 0;
      room.scores.set(playerId, currentScore + 100); // 100 points for correct guess
      console.log('Updated score for', playerId, 'to', room.scores.get(playerId));
    }

    // Notify all players of the guess result
    io.to(roomCode).emit('guess-marked', {
      playerId: playerId,
      isCorrect: isCorrect,
      guesses: room.guesses,
      scores: Object.fromEntries(room.scores)
    });
  });

  // Host ends round and rotates to next host
  socket.on('host-next-round', ({ roomCode }) => {
    console.log('Received host-next-round:', { roomCode, socketId: socket.id });
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error', { message: 'Only the host can start next round' });
      return;
    }

    console.log('Rotating host...');
    console.log('Current players:', room.players.map(p => ({ nickname: p.nickname, isHost: p.isHost })));
    
    try {
      // Find current host index
      const currentHostIndex = room.players.findIndex(p => p.isHost);
      console.log('Current host index:', currentHostIndex);
      
      if (currentHostIndex === -1) {
        console.error('No host found! Defaulting to first player');
        room.currentHostIndex = 0;
      } else {
        // Set next host (rotate through all players)
        room.currentHostIndex = (currentHostIndex + 1) % room.players.length;
      }
      
      console.log('New host index:', room.currentHostIndex);
      
      // Update isHost flags
      room.players.forEach((p, idx) => {
        p.isHost = idx === room.currentHostIndex;
      });

      // Reset game state for new round
      room.gameState = 'waiting';
      room.currentVideo = null;
      room.videoState = 'paused';
      room.guesses = [];

      const newHost = room.players[room.currentHostIndex];
      console.log('New host is:', newHost.nickname);
      console.log('Updated players:', room.players.map(p => ({ nickname: p.nickname, isHost: p.isHost })));

      // Notify all players about host rotation and reset
      io.to(roomCode).emit('host-rotated', {
        players: room.players,
        newHostId: newHost.id,
        newHostNickname: newHost.nickname,
        gameState: room.gameState,
        scores: Object.fromEntries(room.scores)
      });
      
      console.log('Host rotation complete');
    } catch (error) {
      console.error('Error during host rotation:', error);
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove player from all rooms
    for (const [roomCode, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const wasHost = room.players[playerIndex].isHost;
        room.players.splice(playerIndex, 1);
        room.scores.delete(socket.id);
        room.guesses = room.guesses.filter(g => g.playerId !== socket.id);

        // If host left, assign new host
        if (wasHost && room.players.length > 0) {
          room.currentHostIndex = room.currentHostIndex % room.players.length;
          room.players[room.currentHostIndex].isHost = true;
        }

        // If room is empty, delete it
        if (room.players.length === 0) {
          rooms.delete(roomCode);
        } else {
          // Notify remaining players
          io.to(roomCode).emit('player-left', {
            players: room.players,
            scores: Object.fromEntries(room.scores),
            newHost: room.players.find(p => p.isHost)?.nickname
          });
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
