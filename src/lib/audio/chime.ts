// InsumoSync: Synthesized Audio Chime (Web Audio API)
// Author: ui-ux-designer
// Free-Tier & Zero-Asset dependency: Synthesizes a soft two-tone harmonic notification chime

class ChimeNotificationService {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Plays a pleasant two-tone chime (e.g. upon receiving a new incoming order)
   */
  public playOrderChime(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Note 1: E5 (659.25 Hz)
      this.playTone(ctx, 659.25, now, 0.35, 0.15);

      // Note 2: B5 (987.77 Hz) - slight delay for chime effect
      this.playTone(ctx, 987.77, now + 0.12, 0.45, 0.18);
    } catch (e) {
      console.warn('Audio chime could not be played:', e);
    }
  }

  /**
   * Plays a subtle confirmation ping (e.g. adding item to cart or status update)
   */
  public playSuccessPing(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      this.playTone(ctx, 880.0, now, 0.2, 0.1);
    } catch (e) {
      console.warn('Audio ping error:', e);
    }
  }

  private playTone(
    ctx: AudioContext,
    frequency: number,
    startTime: number,
    duration: number,
    volume: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}

export const chimeService = new ChimeNotificationService();
