'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { getSoundManager, getStreakSound, getStreakText } from '@/utils/soundManager';

interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
}

interface Guess {
  playerId: string;
  nickname: string;
  guess: string;
  timestamp: number;
  isCorrect: boolean | null;
}

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomCode = params.code as string;
  const nickname = searchParams.get('nickname') || '';

  const [socket, setSocket] = useState<Socket | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState<'waiting' | 'playing'>('waiting');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [currentVideo, setCurrentVideo] = useState<{ id: string } | null>(null);
  const [videoState, setVideoState] = useState<'paused' | 'playing'>('paused');
  const [myGuess, setMyGuess] = useState('');
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [notification, setNotification] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [inactivityWarning, setInactivityWarning] = useState(false);
  const [minutesUntilClose, setMinutesUntilClose] = useState(30);
  const [streakAnnouncement, setStreakAnnouncement] = useState('');
  const [soundsMuted, setSoundsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'reconnecting' | 'disconnected'>('connecting');

  const playerRef = useRef<HTMLIFrameElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const isHostRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const roomCodeRef = useRef<string>(roomCode);
  const lastKnownTime = useRef<number>(0);
  const seekCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  // Keep refs in sync
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  // Initialize sound manager
  useEffect(() => {
    const soundManager = getSoundManager();
    setSoundsMuted(soundManager.isMuted());
  }, []);

  // Load YouTube IFrame API once on mount
  useEffect(() => {
    if ((window as any).YT) {
      setApiReady(true);
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    (window as any).onYouTubeIframeAPIReady = () => {
      console.log('YouTube API Ready');
      setApiReady(true);
    };

    return () => {
      if ((window as any).onYouTubeIframeAPIReady) {
        delete (window as any).onYouTubeIframeAPIReady;
      }
    };
  }, []);

  // Initialize player ONCE when API is ready
  useEffect(() => {
    if (!apiReady) return;

    console.log('Initializing YouTube player (one-time)');

    ytPlayerRef.current = new (window as any).YT.Player('youtube-player', {
      videoId: '', // Empty initially
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0
      },
      events: {
        onReady: (event: any) => {
          console.log('YouTube player ready');
          setPlayerReady(true);
        },
        onStateChange: (event: any) => {
          const YT = (window as any).YT;
          const stateNames: Record<number, string> = {
            [YT.PlayerState.UNSTARTED]: 'unstarted',
            [YT.PlayerState.ENDED]: 'ended',
            [YT.PlayerState.PLAYING]: 'playing',
            [YT.PlayerState.PAUSED]: 'paused',
            [YT.PlayerState.BUFFERING]: 'buffering',
            [YT.PlayerState.CUED]: 'cued'
          };
          console.log('Player state changed:', event.data, '=', stateNames[event.data] || 'unknown');
          
          // If host plays/pauses directly on the embed, sync it to everyone
          if (isHostRef.current && socketRef.current) {
            if (event.data === YT.PlayerState.PLAYING) {
              console.log('Host started playing, syncing to all...');
              socketRef.current.emit('host-control-video', { roomCode: roomCodeRef.current, action: 'play' });
              
              // Start monitoring for seeks when playing
              if (!seekCheckInterval.current) {
                seekCheckInterval.current = setInterval(() => {
                  if (ytPlayerRef.current && ytPlayerRef.current.getCurrentTime && socketRef.current) {
                    const currentTime = ytPlayerRef.current.getCurrentTime();
                    const timeDiff = Math.abs(currentTime - lastKnownTime.current);
                    
                    // If time jumped more than 2 seconds, it's a seek
                    if (timeDiff > 2 && lastKnownTime.current > 0) {
                      console.log('Host seeked to:', currentTime);
                      socketRef.current.emit('host-seek-video', { roomCode: roomCodeRef.current, time: currentTime });
                    }
                    
                    lastKnownTime.current = currentTime;
                  }
                }, 500); // Check every 500ms
              }
            } else if (event.data === YT.PlayerState.PAUSED) {
              console.log('Host paused, syncing to all...');
              socketRef.current.emit('host-control-video', { roomCode: roomCodeRef.current, action: 'pause' });
              
              // Stop monitoring seeks when paused
              if (seekCheckInterval.current) {
                clearInterval(seekCheckInterval.current);
                seekCheckInterval.current = null;
              }
              
              // Also sync time position on pause (in case they scrubbed while paused)
              if (ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
                const currentTime = ytPlayerRef.current.getCurrentTime();
                socketRef.current.emit('host-seek-video', { roomCode: roomCodeRef.current, time: currentTime });
              }
            }
          }
        }
      }
    });

    return () => {
      // Only destroy on unmount
      if (ytPlayerRef.current && ytPlayerRef.current.destroy) {
        console.log('Destroying YouTube player');
        ytPlayerRef.current.destroy();
      }
    };
  }, [apiReady]); // Only reinitialize if API becomes ready

  // Load new video into existing player
  useEffect(() => {
    if (!currentVideo || !ytPlayerRef.current || !playerReady) return;

    console.log('Loading new video into player:', currentVideo.id);
    
    try {
      ytPlayerRef.current.cueVideoById({
        videoId: currentVideo.id,
        startSeconds: 0
      });
      // Use cueVideoById instead of loadVideoById to prevent autoplay
    } catch (error) {
      console.error('Error loading video:', error);
    }
  }, [currentVideo, playerReady]);

  useEffect(() => {
    if (!roomCode || !nickname) return;

    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
    console.log('=== SOCKET DEBUG ===');
    console.log('Server URL:', serverUrl);
    console.log('Room Code:', roomCode);
    console.log('Nickname:', nickname);
    console.log('==================');
    
    const newSocket = io(serverUrl, {
      transports: ['polling', 'websocket'], // Try polling first (faster on Render free tier)
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying to reconnect
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000 // Reduced to 10 seconds
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected, joining room...');
      setConnectionStatus('connecting');
      newSocket.emit('join-room', { roomCode, nickname });
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      setConnectionStatus('connecting');
      newSocket.emit('join-room', { roomCode, nickname });
    });

    newSocket.on('reconnect_attempt', () => {
      console.log('Attempting to reconnect...');
      setConnectionStatus('reconnecting');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setConnectionStatus('disconnected');
      if (reason === 'io server disconnect') {
        // Server disconnected us, need to manually reconnect
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (error: any) => {
      console.error('=== CONNECTION ERROR ===');
      console.error('Error:', error);
      console.error('Error message:', error.message);
      console.error('Error type:', error.type);
      console.error('Server URL:', serverUrl);
      console.error('=======================');
      setConnectionStatus('reconnecting');
    });

    newSocket.on('connect_timeout', () => {
      console.error('=== CONNECTION TIMEOUT ===');
      console.error('Failed to connect within timeout period');
      console.error('Server URL:', serverUrl);
      console.error('========================');
      setConnectionStatus('reconnecting');
    });

    newSocket.on('room-joined', (data) => {
      console.log('Room joined:', data);
      setConnectionStatus('connected');
      setPlayers(data.players);
      setIsHost(data.isHost);
      setGameState(data.gameState);
      setScores(data.scores);
      if (data.currentVideo) {
        setCurrentVideo({ id: data.currentVideo.id });
      }
      setVideoState(data.videoState);
    });

    newSocket.on('player-joined', (data) => {
      console.log('Player joined:', data);
      setPlayers(data.players);
      setScores(data.scores);
    });

    newSocket.on('video-loaded', (data) => {
      console.log('Video loaded:', data);
      setGameState('playing');
      setCurrentVideo({ id: data.videoId });
      setVideoState(data.videoState);
      setGuesses([]);
      setMyGuess('');
      // Don't reset playerReady - keep the existing player instance
    });

    newSocket.on('video-state-changed', (data) => {
      console.log('Received video-state-changed:', data, 'isHost:', isHostRef.current);
      setVideoState(data.state);
      
      // Control the player for non-host users
      if (!isHostRef.current) {
        // Wait a bit to ensure player is ready
        setTimeout(() => {
          if (ytPlayerRef.current && ytPlayerRef.current.playVideo && ytPlayerRef.current.pauseVideo) {
            try {
              if (data.state === 'playing') {
                console.log('Syncing: Playing video');
                ytPlayerRef.current.playVideo();
              } else if (data.state === 'paused') {
                console.log('Syncing: Pausing video');
                ytPlayerRef.current.pauseVideo();
              }
            } catch (error) {
              console.error('Error controlling video:', error);
            }
          } else {
            console.warn('Player not ready yet, retrying...');
            // Retry after a longer delay
            setTimeout(() => {
              if (ytPlayerRef.current && ytPlayerRef.current.playVideo && ytPlayerRef.current.pauseVideo) {
                try {
                  if (data.state === 'playing') {
                    console.log('Retry: Playing video');
                    ytPlayerRef.current.playVideo();
                  } else if (data.state === 'paused') {
                    console.log('Retry: Pausing video');
                    ytPlayerRef.current.pauseVideo();
                  }
                } catch (error) {
                  console.error('Error controlling video on retry:', error);
                }
              }
            }, 1000);
          }
        }, 100);
      }
    });

    newSocket.on('video-seeked', (data) => {
      console.log('Received video-seeked:', data, 'isHost:', isHostRef.current);
      
      // Only participants seek (not the host who initiated it)
      if (!isHostRef.current && ytPlayerRef.current && ytPlayerRef.current.seekTo) {
        try {
          console.log('Syncing: Seeking to', data.time);
          ytPlayerRef.current.seekTo(data.time, true);
        } catch (error) {
          console.error('Error seeking video:', error);
        }
      }
    });

    newSocket.on('guess-submitted', (data) => {
      setGuesses(data.guesses);
    });

    newSocket.on('guess-marked', (data) => {
      setGuesses(data.guesses);
      setScores(data.scores);
      
      // Only play sound and show announcement for streaks (2+)
      if (data.isCorrect && data.streak >= 2) {
        const soundManager = getSoundManager();
        
        // Play streak sound
        const streakSound = getStreakSound(data.streak);
        if (streakSound) {
          soundManager.play(streakSound);
          
          // Show streak announcement
          const streakText = getStreakText(data.streak);
          if (streakText) {
            setStreakAnnouncement(`${data.streakPlayer}: ${streakText}`);
            setTimeout(() => setStreakAnnouncement(''), 3000);
          }
        }
      }

      // Check if all guesses have been reviewed
      if (data.autoAdvance) {
        // Show notification
        setNotification('All guesses reviewed! Moving to next round...');
        setTimeout(() => setNotification(''), 3000);
      }
    });

    newSocket.on('video-cleared', (data) => {
      console.log('Video cleared');
      setGameState(data.gameState);
      setCurrentVideo(null);
      setVideoState('paused');
      setGuesses([]);
      setMyGuess('');
      // Don't reset playerReady - keep the existing player instance
    });

    newSocket.on('player-left', (data) => {
      console.log('Player left:', data);
      setPlayers(data.players);
      setScores(data.scores);
    });

    newSocket.on('host-rotated', (data) => {
      console.log('Host rotated:', data);
      setPlayers(data.players);
      setScores(data.scores);
      setGameState(data.gameState);
      setCurrentVideo(null);
      setVideoState('paused');
      setGuesses([]);
      setMyGuess('');
      // Don't reset playerReady - keep the existing player instance
      
      // Check if I'm the new host
      const myPlayer = data.players.find((p: Player) => p.nickname === nickname);
      if (myPlayer) {
        setIsHost(myPlayer.isHost);
        if (myPlayer.isHost) {
          console.log('I am the new host!');
          setNotification(`You are now the host! Select a video to start the next round.`);
        } else {
          setNotification(`${data.newHostNickname} is now the host!`);
        }
      } else {
        setNotification(`${data.newHostNickname} is now the host!`);
      }
      
      // Clear notification after 5 seconds
      setTimeout(() => setNotification(''), 5000);
    });

    newSocket.on('inactivity-warning', (data) => {
      console.log('Inactivity warning received:', data);
      setInactivityWarning(true);
      setMinutesUntilClose(data.minutesUntilClose);
    });

    newSocket.on('room-closed', (data) => {
      console.log('Room closed:', data);
      alert(data.message);
      window.location.href = '/';
    });

    newSocket.on('error', (data) => {
      console.error('Socket error:', data);
      if (data.message === 'Room is full') {
        alert('This room is full (max 20 players)');
        window.location.href = '/';
      } else if (data.message === 'Nickname already taken in this room') {
        alert('This nickname is already taken in this room');
        window.location.href = '/';
      }
    });

    return () => {
      // Clean up seek monitoring
      if (seekCheckInterval.current) {
        clearInterval(seekCheckInterval.current);
        seekCheckInterval.current = null;
      }
      newSocket.disconnect();
    };
  }, [roomCode, nickname]);

  const handleSubmitVideo = () => {
    if (!socket || !videoUrl.trim()) return;
    socket.emit('host-submit-video', {
      roomCode,
      videoUrl: videoUrl.trim()
    });
    setVideoUrl('');
  };


  const handleSubmitGuess = () => {
    if (!socket || !myGuess.trim()) return;
    socket.emit('player-submit-guess', {
      roomCode,
      guess: myGuess.trim()
    });
    setMyGuess('');
  };

  const handleMarkGuess = (playerId: string, isCorrect: boolean) => {
    if (!socket) return;
    socket.emit('host-mark-guess', { roomCode, playerId, isCorrect });
  };

  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  const handleNextRound = () => {
    if (!socket) return;
    socket.emit('host-next-round', { roomCode });
  };

  const handleClearVideo = () => {
    if (!socket) return;
    socket.emit('host-clear-video', { roomCode });
  };

  const handleStillHere = () => {
    if (!socket) return;
    socket.emit('still-here', { roomCode });
    setInactivityWarning(false);
  };

  const toggleSounds = () => {
    const soundManager = getSoundManager();
    const newMuted = !soundsMuted;
    soundManager.setMuted(newMuted);
    setSoundsMuted(newMuted);
  };

  const sortedPlayers = [...players].sort((a, b) => (scores[b.nickname] || 0) - (scores[a.nickname] || 0));
  const myGuessData = guesses.find(g => g.nickname === nickname);

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        {/* Navigation Header */}
        <div className="mb-4 flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
          <a 
            href="/"
            className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-2 transition-colors"
          >
            <span className="text-xl">←</span> Back to Home
          </a>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSounds}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
              title={soundsMuted ? 'Unmute sounds' : 'Mute sounds'}
            >
              {soundsMuted ? 'Sounds: OFF' : 'Sounds: ON'}
            </button>
            <div className={`text-sm font-medium ${
              connectionStatus === 'connected' ? 'text-green-400' : 
              connectionStatus === 'reconnecting' ? 'text-yellow-400' : 
              connectionStatus === 'disconnected' ? 'text-red-400' : 
              'text-gray-400'
            }`}>
              {connectionStatus === 'connected' && '● Connected'}
              {connectionStatus === 'connecting' && '○ Connecting...'}
              {connectionStatus === 'reconnecting' && '◐ Reconnecting...'}
              {connectionStatus === 'disconnected' && '○ Disconnected'}
            </div>
          </div>
        </div>

        {/* Notification Banner */}
        {notification && (
          <div className="mb-4 bg-blue-600 text-white px-6 py-4 rounded-lg font-semibold text-center animate-pulse">
            {notification}
          </div>
        )}

        {/* Streak Announcement */}
        {streakAnnouncement && (
          <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
            <div className="bg-gray-900 text-white px-8 py-6 rounded-lg shadow-2xl border-4 border-blue-500 animate-pulse">
              <p className="text-4xl font-black text-center tracking-wider drop-shadow-lg">
                {streakAnnouncement}
              </p>
            </div>
          </div>
        )}

        {/* Inactivity Warning Modal */}
        {inactivityWarning && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-2xl border-2 border-blue-500">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-4">Are You Still There?</h2>
                <p className="text-gray-300 mb-2">This room has been inactive for 30 minutes.</p>
                <p className="text-gray-400 text-sm mb-6">
                  The room will close in {minutesUntilClose} minutes if no activity is detected.
                </p>
                <button
                  onClick={handleStillHere}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-lg transition-all"
                >
                  Yes, I'm Still Here
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <h1 className="text-3xl font-bold text-white mb-2">
            Room: <span className="font-mono">{roomCode}</span>
            {isHost && <span className="ml-3 text-lg text-blue-400">(You are the host)</span>}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Game Area */}
          <div className="lg:col-span-2 space-y-4">
            {/* YouTube Player - Always in DOM for initialization */}
            <div 
              style={
                !currentVideo || !isHost
                  ? { position: 'fixed', top: '-9999px', left: '-9999px', width: '640px', height: '360px', opacity: 0, pointerEvents: 'none', visibility: 'hidden' }
                  : {}
              }
            >
              <div id="youtube-player"></div>
            </div>

            {/* Video Player UI - Shows when video is loaded */}
            {currentVideo && (
              <div className="bg-gray-800 rounded-lg p-4">
                {isHost && (
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h2 className="text-xl font-semibold">Video Player (Host Only)</h2>
                      <p className="text-sm text-gray-400 mt-1">Use the video controls below to play/pause. All participants will hear the audio.</p>
                    </div>
                    <button
                      onClick={handleClearVideo}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold text-sm whitespace-nowrap"
                    >
                      Clear Video
                    </button>
                  </div>
                )}
                
                {!isHost && (
                  <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg flex items-center justify-center mb-4 border border-gray-700">
                    <div className="text-center">
                      <h3 className="text-2xl font-bold text-white">Listen to the Song</h3>
                      <p className="text-gray-400 mt-2">
                        {videoState === 'playing' ? 'Song is playing...' : 'Waiting for host to play...'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Host: Submit Video */}
            {isHost && gameState === 'waiting' && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4">Host Controls</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">YouTube URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="flex-1 px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        onClick={handleSubmitVideo}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
                      >
                        Load Video
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Player: Submit Guess */}
            {!isHost && gameState === 'playing' && !myGuessData && (
              <div className="bg-gray-800 rounded-lg p-4 border-2 border-blue-500">
                <h2 className="text-xl font-bold mb-4 text-white">Your Guess</h2>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={myGuess}
                    onChange={(e) => setMyGuess(e.target.value)}
                    placeholder="Type the name of the artist and the song title"
                    className="flex-1 px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                    onKeyPress={(e) => e.key === 'Enter' && myGuess.trim() && handleSubmitGuess()}
                    autoFocus
                  />
                  <button
                    onClick={handleSubmitGuess}
                    disabled={!myGuess.trim()}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold"
                  >
                    Submit
                  </button>
                </div>
                
                {/* List of all guesses below input */}
                {guesses.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-400 mb-2">All Guesses:</h3>
                    <div className="space-y-2">
                      {guesses.map((guess) => (
                        <div
                          key={guess.playerId}
                          className={`p-2 rounded text-sm ${
                            guess.isCorrect === true
                              ? 'bg-blue-900 text-blue-200 border border-blue-500'
                              : guess.isCorrect === false
                              ? 'bg-gray-700 text-gray-400'
                              : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          <span className="font-medium">{guess.nickname}:</span>{' '}
                          <span>{guess.guess}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Player: Guess Submitted */}
            {!isHost && gameState === 'playing' && myGuessData && (
              <div className="bg-gray-800 rounded-lg p-4 border-2 border-blue-500">
                <div className="mb-4">
                  <p className="text-lg">
                    Your guess: <span className="font-bold">{myGuessData.guess}</span>
                  </p>
                  {myGuessData.isCorrect === null && (
                    <p className="text-gray-400 text-sm mt-2">Waiting for host to review...</p>
                  )}
                  {myGuessData.isCorrect === true && (
                    <p className="text-blue-400 font-bold mt-2">Correct! +100 points</p>
                  )}
                  {myGuessData.isCorrect === false && (
                    <p className="text-gray-400 font-bold mt-2">Incorrect</p>
                  )}
                </div>
                
                {/* List of all guesses below */}
                {guesses.length > 0 && (
                  <div className="pt-4 border-t border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-400 mb-2">All Guesses:</h3>
                    <div className="space-y-2">
                      {guesses.map((guess) => (
                        <div
                          key={guess.playerId}
                          className={`p-2 rounded text-sm ${
                            guess.isCorrect === true
                              ? 'bg-blue-900 text-blue-200 border border-blue-500'
                              : guess.isCorrect === false
                              ? 'bg-gray-700 text-gray-400'
                              : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          <span className="font-medium">{guess.nickname}:</span>{' '}
                          <span>{guess.guess}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Host: Review Guesses */}
            {isHost && gameState === 'playing' && guesses.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4">Guesses</h2>
                <div className="space-y-2 mb-4">
                  {guesses.map((guess) => (
                    <div
                      key={guess.playerId}
                      className={`p-3 rounded-lg ${
                        guess.isCorrect === true
                          ? 'bg-blue-900 border-2 border-blue-500'
                          : guess.isCorrect === false
                          ? 'bg-gray-700 border-2 border-gray-600'
                          : 'bg-gray-700'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-bold">{guess.nickname}:</span>
                          <span className="ml-2">{guess.guess}</span>
                        </div>
                        {guess.isCorrect === null && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleMarkGuess(guess.playerId, true)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-semibold"
                            >
                              Correct
                            </button>
                            <button
                              onClick={() => handleMarkGuess(guess.playerId, false)}
                              className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm font-semibold"
                            >
                              Wrong
                            </button>
                          </div>
                        )}
                        {guess.isCorrect !== null && (
                          <span className={guess.isCorrect ? 'text-blue-400' : 'text-gray-400'}>
                            {guess.isCorrect ? 'Correct' : 'Wrong'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Auto-advance message - Show when all guesses reviewed */}
                {guesses.length > 0 && guesses.every(g => g.isCorrect !== null) && (
                  <div className="pt-4 border-t border-gray-700">
                    <div className="text-center py-3 bg-blue-900 rounded-lg">
                      <p className="text-blue-300 font-semibold">Moving to next round...</p>
                      <p className="text-xs text-gray-400 mt-1">Host will rotate in a moment</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Host Controls - Skip Round Option */}
            {isHost && gameState === 'playing' && (
              <div className="bg-gray-800 rounded-lg p-4">
                {guesses.length === 0 ? (
                  <p className="text-gray-400 text-center mb-4">Waiting for players to submit guesses...</p>
                ) : !guesses.every(g => g.isCorrect !== null) ? (
                  <p className="text-gray-400 text-center mb-4">Review guesses above</p>
                ) : null}
                
                {/* Skip button - for when host wants to skip without reviewing */}
                {!guesses.every(g => g.isCorrect !== null) && (
                  <>
                    <button
                      onClick={handleNextRound}
                      className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-all"
                    >
                      Skip & Pass Host
                    </button>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      Don't want to review? Skip to next player
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Invite Link */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-3">Invite Players</h2>
              <button
                onClick={handleCopyInviteLink}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {copySuccess ? (
                  <span>Link Copied!</span>
                ) : (
                  <span>Copy Invite Link</span>
                )}
              </button>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Share this link with friends to invite them
              </p>
            </div>

            {/* Players & Scores */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-xl font-semibold mb-4">Players ({players.length})</h2>
              <div className="space-y-2">
                {sortedPlayers.map((player) => (
                  <div
                    key={player.id}
                    className={`p-2 rounded ${
                      player.isHost ? 'bg-blue-900 border border-blue-500' : 'bg-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">
                        {player.nickname}
                        {player.isHost && ' (Host)'}
                      </span>
                      <span className="text-blue-400 font-semibold">
                        {scores[player.nickname] || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
