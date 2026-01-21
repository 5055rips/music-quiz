'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function Home() {
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<'create' | 'join'>('create');
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteRoomCode = searchParams.get('room');

  useEffect(() => {
    if (inviteRoomCode) {
      setRoomCode(inviteRoomCode.toUpperCase());
      setModalAction('join');
      setShowModal(true);
    }
  }, [inviteRoomCode]);

  const handleCreateRoomClick = () => {
    setModalAction('create');
    setShowModal(true);
  };

  const handleJoinRoomClick = () => {
    if (!roomCode.trim()) {
      alert('Please enter a room code');
      return;
    }
    setModalAction('join');
    setShowModal(true);
  };

  const handleModalSubmit = () => {
    if (!nickname.trim()) {
      alert('Please enter a nickname');
      return;
    }

    if (modalAction === 'create') {
      // Generate random room code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      router.push(`/room/${code}?nickname=${encodeURIComponent(nickname)}`);
    } else {
      // Join existing room
      if (!roomCode.trim()) {
        alert('Please enter a room code');
        return;
      }
      router.push(`/room/${roomCode.toUpperCase()}?nickname=${encodeURIComponent(nickname)}`);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setNickname('');
  };

  // Normal home screen
  return (
    <>
      <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-2xl border border-blue-500">
          <h1 className="text-5xl font-bold text-center mb-3 text-white">
            Music Quiz
          </h1>
          <p className="text-center text-gray-400 mb-8">Guess the song, win the game!</p>
          
          <div className="space-y-6">
            {/* Create Room Button */}
            <button
              onClick={handleCreateRoomClick}
              className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-lg transition-all shadow-lg"
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
                placeholder="Enter room code"
                className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase text-lg text-center tracking-widest font-mono"
                maxLength={6}
                onKeyPress={(e) => e.key === 'Enter' && roomCode.trim() && handleJoinRoomClick()}
              />
              <button
                onClick={handleJoinRoomClick}
                disabled={!roomCode.trim()}
                className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-bold text-lg transition-all shadow-lg"
              >
                Join Room
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Nickname Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full shadow-2xl border-2 border-blue-500 animate-scale-in">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-white mb-2">
                {modalAction === 'create' ? 'Create Room' : inviteRoomCode ? "You're Invited!" : 'Join Room'}
              </h2>
              {inviteRoomCode && (
                <p className="text-gray-300 text-lg">
                  Room: <span className="font-mono font-bold text-blue-400">{inviteRoomCode}</span>
                </p>
              )}
              {modalAction === 'join' && !inviteRoomCode && (
                <p className="text-gray-300 text-lg">
                  Room: <span className="font-mono font-bold text-blue-400">{roomCode}</span>
                </p>
              )}
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Enter Your Nickname</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Your nickname..."
                  className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-lg"
                  maxLength={20}
                  onKeyPress={(e) => e.key === 'Enter' && nickname.trim() && handleModalSubmit()}
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCloseModal}
                  className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleModalSubmit}
                  disabled={!nickname.trim()}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-all"
                >
                  {modalAction === 'create' ? 'Create' : 'Join'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
