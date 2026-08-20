/** Web Audio EQ + optional loudness compressor for HTMLAudioElement */

export interface EqBands {
  bass: number;
  mid: number;
  treble: number;
}

export interface PlaybackGraph {
  ctx: AudioContext;
  bass: BiquadFilterNode;
  mid: BiquadFilterNode;
  treble: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  gain: GainNode;
  applyEq: (enabled: boolean, bands: EqBands) => void;
  applyNormalize: (enabled: boolean) => void;
  setOutputGain: (value: number) => void;
  /** Smoothly ramp master gain to target over seconds (relative to current output level scale). */
  fadeTo: (target: number, durationSec: number) => Promise<void>;
  resume: () => Promise<void>;
}

export function createPlaybackGraph(audio: HTMLAudioElement): PlaybackGraph {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaElementSource(audio);

  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 200;
  bass.gain.value = 0;

  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1000;
  mid.Q.value = 1;
  mid.gain.value = 0;

  const treble = ctx.createBiquadFilter();
  treble.type = 'highshelf';
  treble.frequency.value = 3200;
  treble.gain.value = 0;

  const compressor = ctx.createDynamicsCompressor();
  const gain = ctx.createGain();
  gain.gain.value = 1;

  source.connect(bass);
  bass.connect(mid);
  mid.connect(treble);
  treble.connect(compressor);
  compressor.connect(gain);
  gain.connect(ctx.destination);

  const applyNormalize = (enabled: boolean) => {
    if (enabled) {
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 3.5;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.25;
    } else {
      compressor.threshold.value = 0;
      compressor.knee.value = 0;
      compressor.ratio.value = 1;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
    }
  };

  const applyEq = (enabled: boolean, bands: EqBands) => {
    bass.gain.value = enabled ? bands.bass : 0;
    mid.gain.value = enabled ? bands.mid : 0;
    treble.gain.value = enabled ? bands.treble : 0;
  };

  applyNormalize(false);
  applyEq(false, { bass: 0, mid: 0, treble: 0 });

  return {
    ctx,
    bass,
    mid,
    treble,
    compressor,
    gain,
    applyEq,
    applyNormalize,
    setOutputGain: (value: number) => {
      const v = Math.max(0, Math.min(1.5, value));
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(v, ctx.currentTime);
      } catch {
        gain.gain.value = v;
      }
    },
    fadeTo: (target: number, durationSec: number) =>
      new Promise<void>((resolve) => {
        const v = Math.max(0, Math.min(1.5, target));
        const dur = Math.max(0.01, durationSec);
        try {
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(v, now + dur);
          window.setTimeout(() => resolve(), Math.ceil(dur * 1000) + 20);
        } catch {
          gain.gain.value = v;
          resolve();
        }
      }),
    resume: async () => {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    },
  };
}
