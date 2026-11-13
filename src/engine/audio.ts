import type { PieceType } from '../game/types';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const ua = (
      navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
    ).userActivation;
    if (ua && !ua.hasBeenActive) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainPeak: number,
    delay = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freqEnd),
      now + duration,
    );

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoise(duration: number, filterFreq: number, gainPeak: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.4));
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  public playSelect(): void {
    this.playTone(520, 680, 0.07, 'triangle', 0.08);
  }

  public playPieceMove(): void {
    this.playTone(170, 75, 0.14, 'sine', 0.16);
    this.playNoise(0.09, 600, 0.08);
  }

  public playDuelHorn(): void {
    this.playTone(146.8, 146.8, 0.45, 'sawtooth', 0.09, 0);
    this.playTone(220.0, 220.0, 0.45, 'triangle', 0.09, 0.05);
    this.playTone(293.7, 293.7, 0.55, 'sawtooth', 0.07, 0.12);
  }

  public playWeaponFire(type: PieceType, isEnemy = false): void {
    const pitchJitter = 0.94 + Math.random() * 0.12;
    const vol = isEnemy ? 0.08 : 0.13;

    switch (type) {
      case 'pawn':
        this.playTone(460 * pitchJitter, 140, 0.11, 'square', vol);
        this.playNoise(0.08, 1800, vol * 0.7);
        break;
      case 'rook':
        this.playTone(180 * pitchJitter, 48, 0.22, 'sawtooth', vol * 1.2);
        this.playNoise(0.18, 900, vol * 1.2);
        break;
      case 'knight':
        this.playTone(720 * pitchJitter, 260, 0.07, 'sawtooth', vol * 0.85);
        this.playNoise(0.05, 2400, vol * 0.5);
        break;
      case 'bishop':
        this.playTone(1180 * pitchJitter, 220, 0.24, 'sawtooth', vol);
        this.playTone(2100 * pitchJitter, 480, 0.18, 'sine', vol * 0.7);
        break;
      case 'queen':
        this.playTone(620 * pitchJitter, 190, 0.09, 'sawtooth', vol * 0.9);
        this.playNoise(0.06, 2100, vol * 0.55);
        break;
      case 'king':
        this.playTone(280 * pitchJitter, 70, 0.26, 'triangle', vol * 1.25);
        this.playTone(540 * pitchJitter, 150, 0.16, 'square', vol * 0.65);
        break;
    }
  }

  public playHitMarker(crit: boolean): void {
    if (crit) {
      this.playTone(1320, 1760, 0.08, 'triangle', 0.11);
    } else {
      this.playTone(940, 620, 0.05, 'triangle', 0.08);
    }
  }

  public playPlayerHurt(): void {
    this.playTone(130, 55, 0.18, 'sawtooth', 0.14);
    this.playNoise(0.12, 420, 0.12);
  }

  public playAbility(): void {
    this.playTone(360, 880, 0.18, 'sine', 0.1);
    this.playTone(540, 1080, 0.2, 'triangle', 0.07, 0.04);
  }

  public playReload(): void {
    this.playTone(280, 420, 0.09, 'triangle', 0.07);
    this.playTone(420, 560, 0.08, 'triangle', 0.06, 0.15);
  }

  public playJump(): void {
    this.playTone(180, 340, 0.11, 'sine', 0.07);
  }

  public playTelegraph(): void {
    this.playTone(640, 960, 0.22, 'sine', 0.06);
  }

  public playVictory(): void {
    this.playTone(261.6, 261.6, 0.22, 'triangle', 0.12, 0);
    this.playTone(329.6, 329.6, 0.22, 'triangle', 0.12, 0.11);
    this.playTone(392.0, 392.0, 0.25, 'triangle', 0.12, 0.22);
    this.playTone(523.3, 523.3, 0.45, 'triangle', 0.14, 0.34);
  }

  public playDefeat(): void {
    this.playTone(246.9, 220.0, 0.25, 'sawtooth', 0.1, 0);
    this.playTone(196.0, 164.8, 0.38, 'sawtooth', 0.11, 0.18);
  }
}
