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
  transports: ['websocket', 'polling'],
  pingTimeout: 60000, // 60 seconds before considering connection dead
  pingInterval: 25000, // Send ping every 25 seconds
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6
});

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3002",
  credentials: true
}));
app.use(express.json());

// In-memory game state
const rooms = new Map();
const playerDisconnectTimers = new Map(); // Track disconnect timers
const roomInactivityTimers = new Map(); // Track room inactivity
const roomWarningTimers = new Map(); // Track 30-minute warnings

const MAX_PLAYERS_PER_ROOM = 20;
const DISCONNECT_GRACE_PERIOD = 30000; // 30 seconds to reconnect
const INACTIVITY_WARNING_TIME = 30 * 60 * 1000; // 30 minutes
const INACTIVITY_CLEANUP_TIME = 60 * 60 * 1000; // 1 hour

// Helper to extract YouTube video ID from URL
function extractYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Helper to get scores object by nickname
function getScoresByNickname(room) {
  const scoresByNickname = {};
  room.players.forEach(player => {
    scoresByNickname[player.nickname] = room.scores.get(player.nickname) || 0;
  });
  return scoresByNickname;
}

// Update room activity timestamp
function updateRoomActivity(roomCode) {
  const room = rooms.get(roomCode);
  if (room) {
    room.lastActivity = Date.now();
    
    // Clear existing timers
    if (roomWarningTimers.has(roomCode)) {
      clearTimeout(roomWarningTimers.get(roomCode));
      roomWarningTimers.delete(roomCode);
    }
    if (roomInactivityTimers.has(roomCode)) {
      clearTimeout(roomInactivityTimers.get(roomCode));
      roomInactivityTimers.delete(roomCode);
    }
    
    // Set 30-minute warning timer
    const warningTimer = setTimeout(() => {
      console.log(`Room ${roomCode}: 30 minutes inactive, sending warning`);
      io.to(roomCode).emit('inactivity-warning', {
        message: 'Room has been inactive for 30 minutes. Still there?',
        minutesUntilClose: 30
      });
      roomWarningTimers.delete(roomCode);
    }, INACTIVITY_WARNING_TIME);
    roomWarningTimers.set(roomCode, warningTimer);
    
    // Set 1-hour cleanup timer
    const cleanupTimer = setTimeout(() => {
      console.log(`Room ${roomCode}: 1 hour inactive, cleaning up`);
      deleteRoom(roomCode);
      roomInactivityTimers.delete(roomCode);
    }, INACTIVITY_CLEANUP_TIME);
    roomInactivityTimers.set(roomCode, cleanupTimer);
  }
}

// Clean up a room completely
function deleteRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  // Notify all players
  io.to(roomCode).emit('room-closed', {
    message: 'Room closed due to inactivity'
  });
  
  // Clear all timers
  if (roomWarningTimers.has(roomCode)) {
    clearTimeout(roomWarningTimers.get(roomCode));
    roomWarningTimers.delete(roomCode);
  }
  if (roomInactivityTimers.has(roomCode)) {
    clearTimeout(roomInactivityTimers.get(roomCode));
    roomInactivityTimers.delete(roomCode);
  }
  
  // Clear player disconnect timers
  room.players.forEach(player => {
    const timerKey = `${roomCode}:${player.id}`;
    if (playerDisconnectTimers.has(timerKey)) {
      clearTimeout(playerDisconnectTimers.get(timerKey));
      playerDisconnectTimers.delete(timerKey);
    }
  });
  
  // Delete room
  rooms.delete(roomCode);
  console.log(`Room ${roomCode} deleted`);
}

// Rotate host to next player
function rotateHost(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) {
    console.log('Room not found for rotation:', roomCode);
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

    // Update activity
    updateRoomActivity(roomCode);

    const newHost = room.players[room.currentHostIndex];
    console.log('New host is:', newHost.nickname);
    console.log('Updated players:', room.players.map(p => ({ nickname: p.nickname, isHost: p.isHost })));

    // Notify all players about host rotation and reset
    io.to(roomCode).emit('host-rotated', {
      players: room.players,
      newHostId: newHost.id,
      newHostNickname: newHost.nickname,
      gameState: room.gameState,
      scores: getScoresByNickname(room)
    });
    
    console.log('Host rotation complete');
  } catch (error) {
    console.error('Error during host rotation:', error);
  }
}

// Remove player from room after grace period
function schedulePlayerRemoval(roomCode, socketId, nickname) {
  const timerKey = `${roomCode}:${socketId}`;
  
  // Clear existing timer if any
  if (playerDisconnectTimers.has(timerKey)) {
    clearTimeout(playerDisconnectTimers.get(timerKey));
  }
  
  // Schedule removal
  const timer = setTimeout(() => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const playerIndex = room.players.findIndex(p => p.id === socketId);
    if (playerIndex === -1) return; // Already removed or reconnected
    
    console.log(`Removing player ${nickname} from room ${roomCode} after disconnect timeout`);
    
    const wasHost = room.players[playerIndex].isHost;
    room.players.splice(playerIndex, 1);
    room.guesses = room.guesses.filter(g => g.playerId !== socketId);
    
    // If room is empty, schedule deletion
    if (room.players.length === 0) {
      console.log(`Room ${roomCode} is now empty, deleting immediately`);
      deleteRoom(roomCode);
      return;
    }
    
    // If host left, assign new host
    if (wasHost && room.players.length > 0) {
      room.currentHostIndex = 0;
      room.players[0].isHost = true;
      console.log(`New host assigned: ${room.players[0].nickname}`);
    }
    
    // Notify remaining players
    io.to(roomCode).emit('player-left', {
      players: room.players,
      scores: getScoresByNickname(room),
      newHost: room.players.find(p => p.isHost)?.nickname,
      leftPlayerNickname: nickname
    });
    
    playerDisconnectTimers.delete(timerKey);
  }, DISCONNECT_GRACE_PERIOD);
  
  playerDisconnectTimers.set(timerKey, timer);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room
  socket.on('join-room', ({ roomCode, nickname }) => {
    if (!roomCode || !nickname) {
      socket.emit('error', { message: 'Room code and nickname are required' });
      return;
    }

    // Input validation
    if (nickname.length > 20 || roomCode.length > 10) {
      socket.emit('error', { message: 'Invalid room code or nickname' });
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
        scores: new Map(),
        streaks: new Map(), // Track consecutive correct answers
        lastActivity: Date.now()
      };
      rooms.set(roomCode, room);
      console.log(`Room ${roomCode} created`);
    }

    // Check if player with this nickname already exists (reconnecting)
    const existingPlayerByNickname = room.players.find(p => p.nickname === nickname);
    
    if (existingPlayerByNickname) {
      // Cancel disconnect timer for this player
      const oldTimerKey = `${roomCode}:${existingPlayerByNickname.id}`;
      if (playerDisconnectTimers.has(oldTimerKey)) {
        clearTimeout(playerDisconnectTimers.get(oldTimerKey));
        playerDisconnectTimers.delete(oldTimerKey);
        console.log(`Cancelled disconnect timer for ${nickname}`);
      }
      
      // Update socket ID for reconnecting player
      existingPlayerByNickname.id = socket.id;
      console.log('Reconnected player:', nickname, 'with score:', room.scores.get(nickname) || 0);
    } else {
      // Check max players
      if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }
      
      // Check for duplicate nickname
      if (room.players.some(p => p.nickname === nickname)) {
        socket.emit('error', { message: 'Nickname already taken in this room' });
        return;
      }
      
      // New player
      const player = {
        id: socket.id,
        nickname: nickname,
        isHost: room.players.length === 0 // First player is host
      };
      room.players.push(player);
      room.scores.set(nickname, 0);
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

    // Update room activity
    updateRoomActivity(roomCode);

    // Send current game state to the joining player
    socket.emit('room-joined', {
      roomCode,
      players: room.players,
      gameState: room.gameState,
      currentVideo: room.currentVideo,
      videoState: room.videoState,
      scores: getScoresByNickname(room),
      isHost: isHost
    });

    // Notify all players in room
    io.to(roomCode).emit('player-joined', {
      players: room.players,
      scores: getScoresByNickname(room)
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

    // Update activity
    updateRoomActivity(roomCode);

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
      
      // Update activity
      updateRoomActivity(roomCode);
      
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

    // Validate guess length
    if (guess.trim().length > 100) {
      socket.emit('error', { message: 'Guess is too long' });
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

    // Update activity
    updateRoomActivity(roomCode);

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

    let streak = 0;
    
    // Update score and streak if correct (use nickname instead of socket ID)
    if (isCorrect) {
      const currentScore = room.scores.get(guess.nickname) || 0;
      const currentStreak = room.streaks.get(guess.nickname) || 0;
      streak = currentStreak + 1;
      
      room.scores.set(guess.nickname, currentScore + 100); // 100 points for correct guess
      room.streaks.set(guess.nickname, streak);
      
      console.log('Updated score for', guess.nickname, 'to', room.scores.get(guess.nickname), 'streak:', streak);
    } else {
      // Reset streak on wrong answer
      room.streaks.set(guess.nickname, 0);
    }

    // Update activity
    updateRoomActivity(roomCode);

    // Check if all guesses have been reviewed
    const allGuessesReviewed = room.guesses.length > 0 && room.guesses.every(g => g.isCorrect !== null);
    
    // Notify all players of the guess result
    io.to(roomCode).emit('guess-marked', {
      playerId: playerId,
      isCorrect: isCorrect,
      guesses: room.guesses,
      scores: getScoresByNickname(room),
      streak: isCorrect ? streak : 0,
      streakPlayer: guess.nickname,
      autoAdvance: allGuessesReviewed
    });

    // If all guesses reviewed, auto-advance after 3 seconds
    if (allGuessesReviewed) {
      console.log('All guesses reviewed, auto-advancing to next round in 3 seconds');
      setTimeout(() => {
        // Check if room still exists and game state hasn't changed
        const currentRoom = rooms.get(roomCode);
        if (!currentRoom || currentRoom.gameState !== 'playing') return;
        
        console.log('Auto-advancing to next round');
        rotateHost(roomCode);
      }, 3000);
    }
  });

  // Host clears current video
  socket.on('host-clear-video', ({ roomCode }) => {
    console.log('Received host-clear-video:', { roomCode, socketId: socket.id });
    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error', { message: 'Only the host can clear video' });
      return;
    }

    // Reset game state to waiting
    room.gameState = 'waiting';
    room.currentVideo = null;
    room.videoState = 'paused';
    room.guesses = [];

    // Update activity
    updateRoomActivity(roomCode);

    // Notify all players
    io.to(roomCode).emit('video-cleared', {
      gameState: room.gameState
    });
  });

  // Host ends round and rotates to next host (manual)
  socket.on('host-next-round', ({ roomCode }) => {
    console.log('Received host-next-round (manual):', { roomCode, socketId: socket.id });
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

    rotateHost(roomCode);
  });

  // User responds to inactivity warning
  socket.on('still-here', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    console.log(`Room ${roomCode}: User responded to inactivity warning`);
    updateRoomActivity(roomCode);
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find which room(s) this player is in
    for (const [roomCode, room] of rooms.entries()) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        console.log(`Player ${player.nickname} disconnected from room ${roomCode}, starting grace period`);
        schedulePlayerRemoval(roomCode, socket.id, player.nickname);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
