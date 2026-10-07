// Web Audio API Ringtone Generator (Zero external audio file dependency)

class RingtoneManager {
  private ctx: AudioContext | null = null;
  private intervalId: any = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Play outgoing ringing tone (gentle dual tone beep pattern)
  startOutgoingRingtone() {
    this.stopRingtone();
    const ctx = this.getContext();
    if (!ctx) return;

    const playTone = () => {
      try {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.value = 440; // A4
        osc2.frequency.value = 480;

        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(ctx.currentTime);
        osc2.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 1.2);
        osc2.stop(ctx.currentTime + 1.2);
      } catch (e) {
        console.error("Audio Context Error", e);
      }
    };

    playTone();
    this.intervalId = setInterval(playTone, 3000);
  }

  // Play incoming ringtone (pleasant melody burst pattern)
  startIncomingRingtone() {
    this.stopRingtone();
    const ctx = this.getContext();
    if (!ctx) return;

    const playRingtoneBurst = () => {
      try {
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.3); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.45); // C6

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.8);
      } catch (e) {
        console.error("Audio Context Error", e);
      }
    };

    playRingtoneBurst();
    this.intervalId = setInterval(playRingtoneBurst, 2000);
  }

  stopRingtone() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const ringtoneManager = new RingtoneManager();
