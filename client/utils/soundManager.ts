// Sound Manager for Quake-style announcer sounds

export type SoundType = 
  | 'firstblood'
  | 'multikill'
  | 'wickedsick'
  | 'ultrakill'
  | 'monsterkill'
  | 'rampage'
  | 'killingspree'
  | 'unstoppable'
  | 'godlike'
  | 'holyshit'
  | 'humiliation'
  | 'headshot'
  | 'prepare';

class SoundManager {
  private sounds: Map<SoundType, HTMLAudioElement> = new Map();
  private muted: boolean = false;
  private volume: number = 0.6;

  constructor() {
    // Initialize sounds - Using actual Quake sounds! (Streak sounds only, 2+)
    this.loadSound('firstblood', '/sounds/firstblood.mp3');
    this.loadSound('multikill', '/sounds/multikill.mp3');
    this.loadSound('wickedsick', '/sounds/wickedsick.mp3');
    this.loadSound('ultrakill', '/sounds/ultrakill.mp3');
    this.loadSound('monsterkill', '/sounds/monsterkill.mp3');
    this.loadSound('rampage', '/sounds/rampage.mp3');
    this.loadSound('killingspree', '/sounds/killingspree.mp3');
    this.loadSound('unstoppable', '/sounds/unstoppable.mp3');
    this.loadSound('godlike', '/sounds/godlike.mp3');
    this.loadSound('holyshit', '/sounds/holyshit.mp3');
    this.loadSound('humiliation', '/sounds/humiliation.mp3');
    this.loadSound('headshot', '/sounds/headshot.mp3');
    this.loadSound('prepare', '/sounds/prepare.mp3');

    // Load muted state from localStorage
    if (typeof window !== 'undefined') {
      const savedMuted = localStorage.getItem('soundsMuted');
      this.muted = savedMuted === 'true';
    }
  }

  private loadSound(type: SoundType, path: string) {
    if (typeof window === 'undefined') return;
    
    const audio = new Audio(path);
    audio.volume = this.volume;
    audio.preload = 'auto';
    
    // Handle missing files gracefully
    audio.addEventListener('error', () => {
      console.warn(`Sound file not found: ${path}`);
    });
    
    this.sounds.set(type, audio);
  }

  play(type: SoundType) {
    if (this.muted) return;
    
    const sound = this.sounds.get(type);
    if (!sound) {
      console.warn(`Sound not found: ${type}`);
      return;
    }

    // Stop and reset if already playing
    sound.currentTime = 0;
    
    // Play with error handling
    sound.play().catch(err => {
      console.warn('Failed to play sound:', err);
    });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('soundsMuted', String(muted));
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.sounds.forEach(sound => {
      sound.volume = this.volume;
    });
  }

  getVolume(): number {
    return this.volume;
  }
}

// Singleton instance
let soundManager: SoundManager | null = null;

export const getSoundManager = (): SoundManager => {
  if (typeof window === 'undefined') {
    // Return a dummy manager for SSR
    return {
      play: () => {},
      setMuted: () => {},
      isMuted: () => false,
      setVolume: () => {},
      getVolume: () => 0.6,
    } as any;
  }

  if (!soundManager) {
    soundManager = new SoundManager();
  }
  return soundManager;
};

// Get the sound to play based on streak - Using actual Quake sounds!
export const getStreakSound = (streak: number): SoundType | null => {
  if (streak === 2) return 'firstblood';      // FIRST BLOOD!
  if (streak === 3) return 'multikill';        // MULTI KILL!
  if (streak === 4) return 'wickedsick';       // WICKED SICK!
  if (streak === 5) return 'ultrakill';        // ULTRA KILL!
  if (streak === 6) return 'monsterkill';      // M-M-M-MONSTER KILL!
  if (streak === 7) return 'rampage';          // RAMPAGE!
  if (streak === 8) return 'killingspree';     // KILLING SPREE!
  if (streak === 9) return 'unstoppable';      // UNSTOPPABLE!
  if (streak >= 10) return 'godlike';          // GODLIKE!
  return null;
};

// Get the display text for streak - Actual Quake announcements!
export const getStreakText = (streak: number): string | null => {
  if (streak === 2) return 'FIRST BLOOD!';
  if (streak === 3) return 'MULTI KILL!';
  if (streak === 4) return 'WICKED SICK!';
  if (streak === 5) return 'ULTRA KILL!';
  if (streak === 6) return 'M-M-M-MONSTER KILL!';
  if (streak === 7) return 'RAMPAGE!';
  if (streak === 8) return 'KILLING SPREE!';
  if (streak === 9) return 'UNSTOPPABLE!';
  if (streak >= 10) return 'GODLIKE!';
  return null;
};
