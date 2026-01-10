'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

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

  const playerRef = useRef<HTMLIFrameElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const isHostRef = useRef(false);
  const [apiReady, setApiReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  // Keep isHostRef in sync
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

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

  // Initialize player when API is ready and we have a video
  useEffect(() => {
    if (!apiReady || !currentVideo) return;

    // Destroy existing player if any
    if (ytPlayerRef.current && ytPlayerRef.current.destroy) {
      ytPlayerRef.current.destroy();
    }

    console.log('Creating YouTube player for video:', currentVideo.id);

    ytPlayerRef.current = new (window as any).YT.Player('youtube-player', {
      videoId: currentVideo.id,
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
          if (isHost && socket) {
            if (event.data === YT.PlayerState.PLAYING) {
              console.log('Host started playing, syncing to all...');
              socket.emit('host-control-video', { roomCode, action: 'play' });
            } else if (event.data === YT.PlayerState.PAUSED) {
              console.log('Host paused, syncing to all...');
              socket.emit('host-control-video', { roomCode, action: 'pause' });
            }
          }
        }
      }
    });
  }, [apiReady, currentVideo, isHost, socket, roomCode]);

  useEffect(() => {
    if (!roomCode || !nickname) return;

    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Socket connected');
      newSocket.emit('join-room', { roomCode, nickname });
    });

    newSocket.on('room-joined', (data) => {
      console.log('Room joined:', data);
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
      setPlayerReady(false);
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

    newSocket.on('guess-submitted', (data) => {
      setGuesses(data.guesses);
    });

    newSocket.on('guess-marked', (data) => {
      setGuesses(data.guesses);
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
      setPlayerReady(false);
      
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

    newSocket.on('error', (data) => {
      console.error('Socket error:', data);
    });

    return () => {
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

  const sortedPlayers = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const myGuessData = guesses.find(g => g.nickname === nickname);

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        {/* Navigation Header */}
        <div className="mb-4 flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
          <a 
            href="/"
            className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-2 transition-colors"
          >
            <span className="text-xl">←</span> Back to Home
          </a>
          <div className="text-sm text-gray-400">
            {socket?.connected ? '🟢 Connected' : '🟡 Connecting...'}
          </div>
        </div>

        {/* Notification Banner */}
        {notification && (
          <div className="mb-4 bg-green-600 text-white px-6 py-4 rounded-lg font-semibold text-center animate-pulse">
            {notification}
          </div>
        )}

        <div className="mb-4">
          <h1 className="text-3xl font-bold text-purple-400 mb-2">
            Room: <span className="font-mono">{roomCode}</span>
            {isHost && <span className="ml-3 text-lg text-yellow-400">(You are the host)</span>}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Game Area */}
          <div className="lg:col-span-2 space-y-4">
            {/* Video Player - Only visible to host */}
            {currentVideo && isHost && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4">Video Player (Host Only)</h2>
                <p className="text-sm text-gray-400 mb-3">Use the video controls below to play/pause. All participants will hear the audio.</p>
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  {/* Player renders here for host */}
                  <div id="youtube-player"></div>
                </div>
              </div>
            )}

            {/* Audio Only View - For non-host players */}
            {currentVideo && !isHost && (
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="aspect-video bg-gradient-to-br from-purple-900 to-gray-900 rounded-lg flex items-center justify-center mb-4">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🎵</div>
                    <h3 className="text-2xl font-bold text-purple-300">Listen to the Song</h3>
                    <p className="text-gray-400 mt-2">
                      {videoState === 'playing' ? 'Song is playing...' : 'Waiting for host to play...'}
                    </p>
                  </div>
                </div>
                {/* Hidden player for non-host - hidden but plays audio */}
                <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', opacity: 0, pointerEvents: 'none', visibility: 'hidden' }}>
                  <div id="youtube-player"></div>
                </div>
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
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
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
              <div className="bg-gray-800 rounded-lg p-4 border-2 border-purple-500">
                <h2 className="text-xl font-bold mb-4 text-purple-400">Your Guess</h2>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={myGuess}
                    onChange={(e) => setMyGuess(e.target.value)}
                    placeholder="Type the name of the artist and the song title"
                    className="flex-1 px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-lg"
                    onKeyPress={(e) => e.key === 'Enter' && myGuess.trim() && handleSubmitGuess()}
                    autoFocus
                  />
                  <button
                    onClick={handleSubmitGuess}
                    disabled={!myGuess.trim()}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold"
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
                              ? 'bg-green-900 text-green-200'
                              : guess.isCorrect === false
                              ? 'bg-red-900 text-red-200'
                              : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          <span className="font-medium">{guess.nickname}:</span>{' '}
                          <span>{guess.guess}</span>
                          {guess.isCorrect === true && <span className="ml-2 text-green-300">✓</span>}
                          {guess.isCorrect === false && <span className="ml-2 text-red-300">✗</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Player: Guess Submitted */}
            {!isHost && gameState === 'playing' && myGuessData && (
              <div className="bg-gray-800 rounded-lg p-4 border-2 border-purple-500">
                <div className="mb-4">
                  <p className="text-lg">
                    Your guess: <span className="font-bold">{myGuessData.guess}</span>
                  </p>
                  {myGuessData.isCorrect === null && (
                    <p className="text-gray-400 text-sm mt-2">Waiting for host to review...</p>
                  )}
                  {myGuessData.isCorrect === true && (
                    <p className="text-green-400 font-bold mt-2">Correct! +100 points</p>
                  )}
                  {myGuessData.isCorrect === false && (
                    <p className="text-red-400 font-bold mt-2">Incorrect</p>
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
                              ? 'bg-green-900 text-green-200'
                              : guess.isCorrect === false
                              ? 'bg-red-900 text-red-200'
                              : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          <span className="font-medium">{guess.nickname}:</span>{' '}
                          <span>{guess.guess}</span>
                          {guess.isCorrect === true && <span className="ml-2 text-green-300">✓</span>}
                          {guess.isCorrect === false && <span className="ml-2 text-red-300">✗</span>}
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
                          ? 'bg-green-900 border-2 border-green-500'
                          : guess.isCorrect === false
                          ? 'bg-red-900 border-2 border-red-500'
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
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold"
                            >
                              Correct
                            </button>
                            <button
                              onClick={() => handleMarkGuess(guess.playerId, false)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm font-semibold"
                            >
                              Wrong
                            </button>
                          </div>
                        )}
                        {guess.isCorrect !== null && (
                          <span className={guess.isCorrect ? 'text-green-400' : 'text-red-400'}>
                            {guess.isCorrect ? 'Correct' : 'Wrong'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Next Round Button - Show when at least one guess has been reviewed */}
                {guesses.some(g => g.isCorrect !== null) && (
                  <div className="pt-4 border-t border-gray-700">
                    <button
                      onClick={handleNextRound}
                      className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-lg font-bold text-lg transition-all shadow-lg"
                    >
                      Next Round →
                    </button>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      Ready to move on? Click to pass host to the next player
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Waiting for guesses */}
            {isHost && gameState === 'playing' && guesses.length === 0 && (
              <div className="bg-gray-800 rounded-lg p-4 text-center">
                <p className="text-gray-400">Waiting for players to submit guesses...</p>
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
                  <>
                    <span>✓</span>
                    <span>Link Copied!</span>
                  </>
                ) : (
                  <>
                    <span>🔗</span>
                    <span>Copy Invite Link</span>
                  </>
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
                      player.isHost ? 'bg-purple-900 border border-purple-500' : 'bg-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">
                        {player.nickname}
                        {player.isHost && ' (Host)'}
                      </span>
                      <span className="text-yellow-400 font-semibold">
                        {scores[player.id] || 0}
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
