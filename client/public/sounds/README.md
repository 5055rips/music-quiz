# Sound Effects for Music Quiz

This directory should contain Quake-style announcer sound effects.

## Required Sound Files

You need to add the following MP3 files to this directory:

### Basic Sounds
- `correct.mp3` - Played when answer is correct
- `wrong.mp3` - Played when answer is wrong

### Streak Sounds (Quake-style)
- `doublekill.mp3` - 2 correct in a row
- `multikill.mp3` - 3 correct in a row
- `megakill.mp3` - 4 correct in a row
- `ultrakill.mp3` - 5 correct in a row
- `monsterkill.mp3` - 6 correct in a row
- `ludicrouskill.mp3` - 7 correct in a row
- `dominating.mp3` - 8 correct in a row
- `unstoppable.mp3` - 9 correct in a row
- `godlike.mp3` - 10+ correct in a row

## Where to Download Sounds

### Option 1: Pixabay (Recommended - Free & Legal)
1. Go to https://pixabay.com/sound-effects/
2. Search for terms like:
   - "correct beep"
   - "wrong buzzer"
   - "game announcer"
   - "achievement"
   - "victory"
3. Download as MP3 and rename to match the filenames above

### Option 2: Freesound.org
1. Go to https://freesound.org
2. Create a free account
3. Search for "game announcer" or "quake style"
4. Filter by Creative Commons licenses
5. Download and convert to MP3 if needed

### Option 3: Create Your Own
1. Use text-to-speech services with dramatic voices
2. Tools like:
   - ElevenLabs (https://elevenlabs.io) - AI voices
   - TTSMaker (https://ttsmaker.com) - Free TTS
   - Uberduck (https://uberduck.ai) - Custom voices
3. Generate phrases like "DOUBLE KILL!" with dramatic voices
4. Export as MP3

### Option 4: Gaming Sound Effect Packs
- Check itch.io for "FPS sound packs"
- Look for "Quake-inspired" or "arena shooter" packs
- Many free packs available for indie games

## Important Notes

- **Copyright**: Do NOT use actual Quake sounds - they're copyrighted by id Software
- **License**: Only use sounds with appropriate licenses (CC0, CC-BY, or similar)
- **Format**: All files should be MP3 format
- **Volume**: Normalize volume across all files for consistency
- **Duration**: Keep sounds short (0.5 - 2 seconds)

## Testing

After adding sound files:
1. Start the client (`npm run dev`)
2. Join a room
3. Check browser console for any "Sound file not found" errors
4. Test by getting correct/wrong answers
5. Build up a streak to hear the Quake-style announcements

## Optional: Sound Editing

If you need to edit sounds:
- **Audacity** (free) - https://www.audacityteam.org/
- Trim length, adjust volume, convert formats
- Normalize audio levels for consistency
