# Quake-Style Sound Effects Setup Guide

## What I've Built

Your music quiz now has **ACTUAL QUAKE ANNOUNCER SOUNDS**! When players get consecutive correct answers, it triggers epic announcements:

- 2 correct: **FIRST BLOOD!**
- 3 correct: **MULTI KILL!**
- 4 correct: **WICKED SICK!**
- 5 correct: **ULTRA KILL!**
- 6 correct: **M-M-M-MONSTER KILL!**
- 7 correct: **RAMPAGE!**
- 8 correct: **KILLING SPREE!**
- 9 correct: **UNSTOPPABLE!**
- 10+ correct: **GODLIKE!**

## Quick Start

### Step 1: Get the Sound Files

You need 11 MP3 files. Here are the easiest ways:

#### Fastest Option: AI Voice Generator (5 minutes)
1. Go to https://ttsmaker.com (free, no signup)
2. Select a dramatic/deep voice (e.g., "Brian" or "Eric")
3. Generate these phrases:
   - "Correct" → save as `correct.mp3`
   - "Wrong" → save as `wrong.mp3`
   - "Double kill!" → save as `doublekill.mp3`
   - "Multi kill!" → save as `multikill.mp3`
   - "Mega kill!" → save as `megakill.mp3`
   - "Ultra kill!" → save as `ultrakill.mp3`
   - "Monster kill!" → save as `monsterkill.mp3`
   - "Ludicrous kill!" → save as `ludicrouskill.mp3`
   - "Dominating!" → save as `dominating.mp3`
   - "Unstoppable!" → save as `unstoppable.mp3`
   - "God like!" → save as `godlike.mp3`
4. Download each as MP3

#### Best Quality: Pixabay (10 minutes)
1. Go to https://pixabay.com/sound-effects/
2. Search and download:
   - "success" or "correct beep" → rename to `correct.mp3`
   - "error" or "wrong buzzer" → rename to `wrong.mp3`
   - "achievement" sounds for the kill streaks
3. You might need to combine searches for all sounds

#### Professional Option: ElevenLabs (15 minutes, requires account)
1. Go to https://elevenlabs.io
2. Sign up for free (10k characters/month)
3. Choose "Antoni" or "Josh" voice (dramatic)
4. Generate all phrases above
5. Download as MP3

### Step 2: Add Files to Project

1. Save all MP3 files to:
   ```
   C:\Users\gormu\5055.rip\music-quiz\client\public\sounds\
   ```

2. Your folder should look like:
   ```
   sounds/
   ├── correct.mp3
   ├── wrong.mp3
   ├── doublekill.mp3
   ├── multikill.mp3
   ├── megakill.mp3
   ├── ultrakill.mp3
   ├── monsterkill.mp3
   ├── ludicrouskill.mp3
   ├── dominating.mp3
   ├── unstoppable.mp3
   └── godlike.mp3
   ```

### Step 3: Test It

1. Start your local server and client (if not running)
2. Create a room and join with 2+ people
3. Play a song as host
4. Mark someone's answer as correct
5. Mark same person's next answer as correct → **DOUBLE KILL!**
6. Keep marking them correct to hear higher streaks

## Features Included

✅ **Sound Manager**: Handles all audio playback  
✅ **Streak Tracking**: Server tracks consecutive correct answers per player  
✅ **Visual Announcements**: Big flashy text appears on screen  
✅ **Mute Button**: Toggle sounds on/off (top right corner)  
✅ **Volume Control**: Set to 60% by default, adjustable in code  
✅ **LocalStorage**: Remembers mute preference  
✅ **Error Handling**: Gracefully handles missing sound files  

## Customization

### Change Volume
Edit `client/utils/soundManager.ts`:
```typescript
private volume: number = 0.6;  // Change to 0.1-1.0
```

### Change Streak Requirements
Edit `client/utils/soundManager.ts` in `getStreakSound()`:
```typescript
if (streak === 2) return 'doublekill';  // Change to 3, 4, etc.
```

### Change Points per Correct Answer
Edit `server/index.js`:
```typescript
room.scores.set(guess.nickname, currentScore + 100); // Change 100 to any value
```

### Add Bonus Points for Streaks
Edit `server/index.js` in the `host-mark-guess` handler:
```typescript
if (isCorrect) {
  const basePoints = 100;
  const bonusPoints = streak > 1 ? (streak - 1) * 50 : 0; // 50 bonus per streak level
  const totalPoints = basePoints + bonusPoints;
  room.scores.set(guess.nickname, currentScore + totalPoints);
}
```

## Troubleshooting

**Sounds not playing?**
- Check browser console for "Sound file not found" errors
- Verify all MP3 files are in `/public/sounds/`
- Make sure filenames match exactly (case-sensitive)
- Check "Sounds: ON" button in top right

**Sounds too loud/quiet?**
- Adjust volume in `soundManager.ts`
- Or normalize audio files using Audacity

**Want different sounds?**
- Replace any MP3 file with your own
- Keep same filenames
- Refresh page to load new sounds

**Streak not working?**
- Check server console - should log "streak: X"
- Streaks reset to 0 on wrong answer
- Streaks are per-player, not global

## Legal Note

⚠️ **Do NOT use actual Quake sound files** - they're copyrighted by id Software. Only use:
- Royalty-free sounds (Pixabay, Freesound with CC0 license)
- AI-generated voices (TTS Maker, ElevenLabs)
- Sounds you create yourself

## Next Steps

Want to add more features?
- **Different sound sets**: Create theme packs (sci-fi, medieval, etc.)
- **Custom announcer**: Let users upload their own voice
- **Sound preview**: Test sounds from settings menu
- **Per-player volumes**: Let each user set their own volume
- **Music ducking**: Lower game audio when announcements play

Enjoy your Quake-style announcements! 🎮
