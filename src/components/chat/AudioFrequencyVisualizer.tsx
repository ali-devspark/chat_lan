"use client";

import React, { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface AudioFrequencyVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
  isMuted?: boolean;
  className?: string;
}

export function AudioFrequencyVisualizer({
  stream,
  isActive,
  isMuted = false,
  className = "",
}: AudioFrequencyVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelBarRef = useRef<HTMLDivElement | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasReceivedSound, setHasReceivedSound] = useState(false);

  const isSpeakingRef = useRef(false);
  const hasReceivedSoundRef = useRef(false);

  const effectiveIsSpeaking = isActive && Boolean(stream) && isSpeaking;

  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive || !stream) {
      return;
    }

    let isMounted = true;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch((err) => {
          console.warn("AudioContext resume warning:", err);
        });
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // 32 frequency bins
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const canvas = canvasRef.current;
      const ctx = canvas ? canvas.getContext("2d") : null;

      const barCount = 18;
      const barHeights = new Float32Array(barCount).fill(4);

      const render = () => {
        if (!isMounted) return;

        analyser.getByteFrequencyData(dataArray);

        // Calculate speech energy in typical human speech range (~100Hz - 3400Hz, bins 1 to 20)
        let sum = 0;
        let count = 0;
        for (let i = 1; i < Math.min(bufferLength, 22); i++) {
          sum += dataArray[i];
          count++;
        }
        const avgEnergy = count > 0 ? sum / count : 0;
        const normalizedLevel = Math.min(100, Math.round((avgEnergy / 140) * 100));

        // Update DOM bar directly without triggering React re-renders (zero FPS drop on mobile)
        if (levelBarRef.current) {
          levelBarRef.current.style.width = `${Math.max(6, normalizedLevel)}%`;
        }

        if (avgEnergy > 10) {
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            setIsSpeaking(true);
          }
          if (!hasReceivedSoundRef.current) {
            hasReceivedSoundRef.current = true;
            setHasReceivedSound(true);
          }
          if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
          speechTimeoutRef.current = setTimeout(() => {
            if (isMounted) {
              isSpeakingRef.current = false;
              setIsSpeaking(false);
              if (levelBarRef.current) {
                levelBarRef.current.style.width = "6%";
              }
            }
          }, 350);
        }

        // Draw frequency bars on canvas
        if (canvas && ctx) {
          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          const spacing = 4;
          const barWidth = (width - (barCount - 1) * spacing) / barCount;

          for (let i = 0; i < barCount; i++) {
            // Map bar to frequency bin
            const binIndex = Math.min(
              Math.floor((i / barCount) * (bufferLength * 0.75)) + 1,
              bufferLength - 1
            );
            const rawValue = dataArray[binIndex] || 0;
            // Target height between 4px and max height - 4px
            const targetHeight = Math.max(4, (rawValue / 255) * (height - 6));

            // Smooth interpolation
            barHeights[i] = barHeights[i] * 0.72 + targetHeight * 0.28;

            const x = i * (barWidth + spacing);
            const currentH = barHeights[i];
            const y = (height - currentH) / 2; // Center vertically

            // Vibrant gradient depending on speech energy
            const gradient = ctx.createLinearGradient(0, y, 0, y + currentH);
            if (avgEnergy > 10) {
              // Active voice: glowing emerald to cyan
              gradient.addColorStop(0, "#34d399"); // emerald-400
              gradient.addColorStop(0.5, "#10b981"); // emerald-500
              gradient.addColorStop(1, "#06b6d4"); // cyan-500
            } else {
              // Idle baseline: subtle muted emerald
              gradient.addColorStop(0, "rgba(16, 185, 129, 0.45)");
              gradient.addColorStop(1, "rgba(6, 182, 212, 0.25)");
            }

            ctx.fillStyle = gradient;
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
              ctx.roundRect(x, y, barWidth, currentH, Math.min(barWidth / 2, currentH / 2));
            } else {
              ctx.rect(x, y, barWidth, currentH);
            }
            ctx.fill();
          }
        }

        animationFrameRef.current = requestAnimationFrame(render);
      };

      render();
    } catch (err) {
      console.error("AudioFrequencyVisualizer error:", err);
    }

    const currentLevelBar = levelBarRef.current;

    return () => {
      isMounted = false;
      isSpeakingRef.current = false;
      hasReceivedSoundRef.current = false;
      setIsSpeaking(false);
      setHasReceivedSound(false);
      if (currentLevelBar) {
        currentLevelBar.style.width = "6%";
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {}
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {}
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        try {
          audioContextRef.current.close();
        } catch {}
      }
    };
  }, [stream, isActive]);

  return (
    <div className={`flex flex-col items-center w-full space-y-3 ${className}`}>
      {/* Real-time Frequency Waveform Canvas */}
      <div className="relative w-full px-2 py-1.5 rounded-2xl bg-black/30 border border-emerald-500/20 backdrop-blur-sm shadow-inner flex flex-col items-center">
        <canvas
          ref={canvasRef}
          width={280}
          height={48}
          className="w-full h-12 block"
        />

        {/* Dynamic Voice Level Indicator Bar */}
        <div className="w-full h-1 bg-muted/40 rounded-full overflow-hidden mt-1.5">
          <div
            ref={levelBarRef}
            className={`h-full transition-all duration-150 rounded-full ${
              effectiveIsSpeaking
                ? "bg-linear-to-r from-emerald-500 via-teal-400 to-cyan-400 shadow-sm shadow-emerald-400/80"
                : "bg-emerald-500/30"
            }`}
            style={{ width: "6%" }}
          />
        </div>
      </div>

      {/* Voice Reception Status Indicator */}
      <div className="flex items-center justify-center gap-2">
        {effectiveIsSpeaking ? (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-sm animate-in fade-in duration-150">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <Volume2 className="h-3.5 w-3.5" />
            <span>صوت المتصل يصل الآن • جاري التحدث</span>
          </div>
        ) : hasReceivedSound ? (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500/80 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500/60" />
            <Volume2 className="h-3.5 w-3.5 opacity-70" />
            <span>الصوت متصل ومستقر • صامت حالياً</span>
          </div>
        ) : !stream ? (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500/90 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-amber-500/60 animate-pulse" />
            <Volume2 className="h-3.5 w-3.5 opacity-60" />
            <span>جاري مزامنة مسار الصوت بين الشبكتين...</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 border border-border/40 text-muted-foreground text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-pulse" />
            <Volume2 className="h-3.5 w-3.5 opacity-50" />
            <span>الصوت متصل • بانتظار كلام المتصل</span>
          </div>
        )}
      </div>

      {/* Local Microphone Mute Badge if Muted */}
      {isMuted && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-destructive/15 text-destructive border border-destructive/25 text-[11px] font-medium">
          <VolumeX className="h-3 w-3" />
          <span>الميكروفون مكتوم من قبلك</span>
        </div>
      )}
    </div>
  );
}
