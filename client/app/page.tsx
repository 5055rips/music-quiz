'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function Home() {
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteRoomCode = searchParams.get('room');

  useEffect(() => {
    if (inviteRoomCode) {
      setRoomCode(inviteRoomCode.toUpperCase());
    }
  }, [inviteRoomCode]);

  const handleCreateRoom = () => {
    if (!nickname.trim()) {
      alert('Please enter a nickname');
      return;
    }
    // Generate random room code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    router.push(`/room/${code}?nickname=${encodeURIComponent(nickname)}`);
  };

  const handleJoinRoom = () => {
    if (!roomCode.trim() || !nickname.trim()) {
      alert('Please enter both room code and nickname');
      return;
    }
    router.push(`/room/${roomCode.toUpperCase()}?nickname=${encodeURIComponent(nickname)}`);
  };

  // If invited via link, show special join screen
  if (inviteRoomCode) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-2xl border border-blue-500">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">🎵</div>
            <h1 className="text-4xl font-bold mb-2 text-blue-400">
              You&apos;re Invited!
            </h1>
            <p className="text-gray-300 text-lg">
              Join room <span className="font-mono font-bold text-blue-300">{inviteRoomCode}</span>
            </p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">Enter Your Nickname</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Your nickname..."
                className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                maxLength={20}
                onKeyPress={(e) => e.key === 'Enter' && nickname.trim() && handleJoinRoom()}
                autoFocus
              />
            </div>

            <button
              onClick={handleJoinRoom}
              disabled={!nickname.trim()}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition-all shadow-lg"
            >
              Join Room
            </button>

            <div className="text-center pt-4">
              <a href="/" className="text-purple-400 hover:text-purple-300 text-sm">
                ← Go back to home
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Normal home screen
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-2xl border border-purple-500">
        <h1 className="text-5xl font-bold text-center mb-3 text-purple-400">
          Music Quiz
        </h1>
        <p className="text-center text-gray-400 mb-8">Guess the song, win the game!</p>
        
        <div className="space-y-6">
          {/* Nickname Input - First Thing */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Enter Your Nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname..."
              className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-lg"
              maxLength={20}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
            />
          </div>

          {/* Create Room Button */}
          <button
            onClick={handleCreateRoom}
            disabled={!nickname.trim()}
            className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition-all shadow-lg"
          >
            Create New Room
          </button>

          {/* OR Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-gray-800 text-gray-400">OR</span>
            </div>
          </div>

          {/* Join Room Section */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">Join Existing Room</label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-digit room code"
              className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-lg text-center tracking-widest font-mono"
              maxLength={6}
              onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
            />
            <button
              onClick={handleJoinRoom}
              disabled={!nickname.trim() || !roomCode.trim()}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition-all shadow-lg"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
