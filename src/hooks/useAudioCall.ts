"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ringtoneManager } from "@/lib/webrtc/ringtone";
import { CallState } from "@/components/chat/VoiceCallModal";
import type { User as SupabaseUser, RealtimeChannel } from "@supabase/supabase-js";

export type CallType = "audio" | "video";

export interface CallUser {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  conversationId?: string;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  // High-availability public Google STUN servers
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.services.mozilla.com" },
];

function getFallbackIceServers(): RTCConfiguration {
  const customTurnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const customTurnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const customTurnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  const servers: RTCIceServer[] = [...DEFAULT_ICE_SERVERS];

  if (customTurnUrl) {
    servers.unshift({
      urls: customTurnUrl.split(",").map((u) => u.trim()),
      username: customTurnUser || "",
      credential: customTurnCred || "",
    });
  }

  return {
    iceServers: servers,
    iceCandidatePoolSize: 10,
  };
}

function getCallRoomTopic(id1: string, id2: string): string {
  const sorted = [id1, id2].sort();
  return `call-room:${sorted[0]}-${sorted[1]}`;
}

export function useAudioCall(
  currentUser: SupabaseUser | null,
  showToast?: (msg: string, type?: "success" | "error" | "info") => void
) {
  const supabase = useMemo(() => createClient(), []);
  const [callState, setCallState] = useState<CallState>("idle");
  const [callType, setCallType] = useState<CallType>("audio");
  const [otherUser, setOtherUser] = useState<CallUser | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const callTypeRef = useRef<CallType>("audio");
  const isVideoOffRef = useRef<boolean>(false);
  const facingModeRef = useRef<"user" | "environment">("user");
  const isSwitchingCameraRef = useRef<boolean>(false);

  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const isRoomSubscribedRef = useRef<boolean>(false);
  const pendingSignalsQueueRef = useRef<Array<{ event: string; payload: Record<string, unknown> }>>([]);

  const pendingIceCandidates = useRef<RTCIceCandidateInit[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const invitePulseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outgoingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboundSignalChannelRef = useRef<RealtimeChannel | null>(null);

  // Guards against duplicate logging, stale pulses and phantom call resurrection
  const hasLoggedCallRef = useRef<boolean>(false);
  const currentCallIdRef = useRef<string | null>(null);
  const recentlyEndedCallIdsRef = useRef<Set<string>>(new Set());

  const callStateRef = useRef<CallState>("idle");
  const otherUserRef = useRef<CallUser | null>(null);
  const isCallerRef = useRef<boolean>(false);
  const conversationIdRef = useRef<string | null>(null);
  const durationSecondsRef = useRef<number>(0);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const disconnectGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cachedIceConfigRef = useRef<RTCConfiguration>(getFallbackIceServers());

  // Fetch latest dynamic ICE/TURN servers from server API on mount
  useEffect(() => {
    let isMounted = true;
    fetch("/api/webrtc/ice-servers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data?.iceServers) {
          cachedIceConfigRef.current = {
            iceServers: data.iceServers,
            iceCandidatePoolSize: data.iceCandidatePoolSize || 10,
          };
        }
      })
      .catch((err) => {
        console.warn("[useAudioCall] Could not load dynamic ICE servers, using fallback:", err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Synchronize state refs for callbacks
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    callTypeRef.current = callType;
  }, [callType]);

  useEffect(() => {
    isVideoOffRef.current = isVideoOff;
  }, [isVideoOff]);

  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);

  useEffect(() => {
    otherUserRef.current = otherUser;
  }, [otherUser]);

  useEffect(() => {
    durationSecondsRef.current = durationSeconds;
  }, [durationSeconds]);

  // Play remote audio safely handling mobile autoplay restrictions
  const playRemoteAudio = useCallback(() => {
    const audioEl = remoteAudioRef.current;
    const stream = remoteStreamRef.current;
    if (!audioEl || !stream) return;

    if (audioEl.srcObject !== stream) {
      if (audioEl.src && audioEl.src.startsWith("data:")) {
        audioEl.removeAttribute("src");
      }
      audioEl.srcObject = stream;
    }
    audioEl.muted = false;
    audioEl.volume = 1.0;

    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsAudioBlocked(false);
        })
        .catch((err) => {
          console.warn("[useAudioCall] Remote audio play caught:", err);
          // If browser blocked autoplay, flag it so user can click to unblock
          setIsAudioBlocked(true);
        });
    }
  }, []);

  // Pre-prime / unlock audio on direct user touch/click gesture (Call / Accept button)
  const unlockAudio = useCallback(() => {
    const audioEl = remoteAudioRef.current;
    if (audioEl) {
      audioEl.muted = false;
      audioEl.volume = 1.0;
      // Play a silent 1-sample WAV to authorize the audio element for playback on iOS Safari / Chrome
      if (!audioEl.srcObject && !audioEl.src) {
        audioEl.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      }
      audioEl.play().then(() => {
        setIsAudioBlocked(false);
      }).catch(() => {
        // Pre-prime catch can be silently ignored
      });
    }
  }, []);

  // Ensure remote audio element plays when stream is assigned
  useEffect(() => {
    if (remoteStream) {
      playRemoteAudio();
    }
  }, [remoteStream, playRemoteAudio]);

  // Mark call ID as recently ended so in-flight pulses cannot resurrect it
  const markCallEnded = useCallback((callId: string | null) => {
    if (!callId) return;
    recentlyEndedCallIdsRef.current.add(callId);
    setTimeout(() => {
      recentlyEndedCallIdsRef.current.delete(callId);
    }, 30000);
  }, []);

  // Clean up WebRTC peer connection, local streams, room channel, timers & ringtones
  const cleanupCall = useCallback(() => {
    ringtoneManager.stopRingtone();

    if (disconnectGraceTimerRef.current) {
      clearTimeout(disconnectGraceTimerRef.current);
      disconnectGraceTimerRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (invitePulseIntervalRef.current) {
      clearInterval(invitePulseIntervalRef.current);
      invitePulseIntervalRef.current = null;
    }

    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }

    if (outboundSignalChannelRef.current) {
      supabase.removeChannel(outboundSignalChannelRef.current);
      outboundSignalChannelRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }
    setRemoteStream(null);

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current);
      roomChannelRef.current = null;
    }
    isRoomSubscribedRef.current = false;
    pendingSignalsQueueRef.current = [];
    pendingIceCandidates.current = [];

    setDurationSeconds(0);
    setIsMuted(false);
    setIsVideoOff(false);
    isVideoOffRef.current = false;
    setIsRemoteVideoOff(false);
    isSwitchingCameraRef.current = false;
    setFacingMode("user");
    facingModeRef.current = "user";
    setCallType("audio");
    callTypeRef.current = "audio";
  }, [supabase]);

  // Log Call Message into Supabase `messages` table - Guaranteed single execution per call
  const logCallMessage = useCallback(
    async (type: "answered" | "rejected" | "missed" | "busy", duration: number = 0) => {
      const convId = conversationIdRef.current;
      if (!convId || !currentUser?.id || !isCallerRef.current) return;

      // Strict lock: Prevent any double-logging for the same call
      if (hasLoggedCallRef.current) {
        return;
      }
      hasLoggedCallRef.current = true;

      let content = "";
      const isVid = callTypeRef.current === "video" ? ":video" : "";
      if (type === "answered") {
        content = `[call_log:answered:${duration}${isVid}]`;
      } else if (type === "rejected") {
        content = `[call_log:rejected${isVid}]`;
      } else if (type === "missed") {
        content = `[call_log:missed${isVid}]`;
      } else if (type === "busy") {
        content = `[call_log:busy${isVid}]`;
      }

      if (!content) return;

      try {
        await supabase.from("messages").insert({
          conversation_id: convId,
          sender_id: currentUser.id,
          content,
        });
      } catch (err) {
        console.error("Failed to insert call log message:", err);
      }
    },
    [currentUser?.id, supabase]
  );

  // Reset call to idle state after brief delay
  const resetToIdle = useCallback(
    (newState: CallState = "idle", delayMs: number = 0) => {
      setCallState(newState);
      const callIdToMark = currentCallIdRef.current;
      if (callIdToMark) {
        markCallEnded(callIdToMark);
      }

      if (delayMs > 0) {
        setTimeout(() => {
          cleanupCall();
          setCallState("idle");
          setOtherUser(null);
          currentCallIdRef.current = null;
        }, delayMs);
      } else {
        cleanupCall();
        setCallState("idle");
        setOtherUser(null);
        currentCallIdRef.current = null;
      }
    },
    [cleanupCall, markCallEnded]
  );

  // Unified Call Termination Handlers (Idempotent to avoid duplicate processing)
  const handleCallRejected = useCallback((payload?: { callId?: string }) => {
    const callId = payload?.callId || currentCallIdRef.current;
    if (callId) {
      markCallEnded(callId);
    }

    if (callStateRef.current === "idle" || callStateRef.current === "rejected") {
      return;
    }
    ringtoneManager.stopRingtone();
    if (invitePulseIntervalRef.current) {
      clearInterval(invitePulseIntervalRef.current);
      invitePulseIntervalRef.current = null;
    }
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
    if (outboundSignalChannelRef.current) {
      supabase.removeChannel(outboundSignalChannelRef.current);
      outboundSignalChannelRef.current = null;
    }
    if (isCallerRef.current) {
      logCallMessage("rejected");
    }
    showToastRef.current?.("تم رفض المكالمة", "info");
    resetToIdle("rejected", 1800);
  }, [logCallMessage, resetToIdle, markCallEnded, supabase]);

  const handleCallHangup = useCallback((payload?: { callId?: string }) => {
    const callId = payload?.callId || currentCallIdRef.current;
    if (callId) {
      markCallEnded(callId);
    }

    if (callStateRef.current === "idle" || callStateRef.current === "ended") {
      return;
    }
    ringtoneManager.stopRingtone();
    if (invitePulseIntervalRef.current) {
      clearInterval(invitePulseIntervalRef.current);
      invitePulseIntervalRef.current = null;
    }
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
    if (outboundSignalChannelRef.current) {
      supabase.removeChannel(outboundSignalChannelRef.current);
      outboundSignalChannelRef.current = null;
    }
    showToastRef.current?.("انتهت المكالمة", "info");
    if (isCallerRef.current) {
      if (callStateRef.current === "connected") {
        logCallMessage("answered", durationSecondsRef.current);
      } else if (callStateRef.current === "outgoing") {
        logCallMessage("missed");
      }
    }
    resetToIdle("ended", 1200);
  }, [logCallMessage, resetToIdle, markCallEnded, supabase]);

  const handleCallBusy = useCallback((payload?: { callId?: string }) => {
    const callId = payload?.callId || currentCallIdRef.current;
    if (callId) {
      markCallEnded(callId);
    }

    if (callStateRef.current === "idle" || callStateRef.current === "busy") {
      return;
    }
    ringtoneManager.stopRingtone();
    if (invitePulseIntervalRef.current) {
      clearInterval(invitePulseIntervalRef.current);
      invitePulseIntervalRef.current = null;
    }
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
    if (outboundSignalChannelRef.current) {
      supabase.removeChannel(outboundSignalChannelRef.current);
      outboundSignalChannelRef.current = null;
    }
    if (isCallerRef.current) {
      logCallMessage("busy");
    }
    showToastRef.current?.("المستخدم في مكالمة أخرى حالياً", "info");
    resetToIdle("busy", 2500);
  }, [logCallMessage, resetToIdle, markCallEnded, supabase]);

  // Start Call Duration Timer
  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setDurationSeconds(0);
    timerIntervalRef.current = setInterval(() => {
      setDurationSeconds((prev) => prev + 1);
    }, 1000);
  }, []);

  // Send a signal via the dedicated Call Room channel
  const sendRoomSignal = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      if (!currentUser?.id) return;
      const fullPayload = {
        ...payload,
        senderId: currentUser.id,
      };

      const channel = roomChannelRef.current;
      if (channel && isRoomSubscribedRef.current) {
        channel.send({
          type: "broadcast",
          event,
          payload: fullPayload,
        }).catch((err) => console.error("Error sending room signal:", err));
      } else {
        // Queue until subscribed
        pendingSignalsQueueRef.current.push({ event, payload: fullPayload });
      }
    },
    [currentUser?.id]
  );

  // Send a direct signal to a target user's inbox channel
  const sendDirectSignal = useCallback(
    async (targetUserId: string, event: string, payload: Record<string, unknown> = {}) => {
      if (!currentUser?.id) return;
      const fullPayload = {
        ...payload,
        senderId: currentUser.id,
      };

      // 1. If an outbound channel is already open (e.g. during outgoing call), reuse it directly
      if (outboundSignalChannelRef.current) {
        try {
          await outboundSignalChannelRef.current.send({
            type: "broadcast",
            event,
            payload: fullPayload,
          });
          return;
        } catch (e) {
          console.warn("Direct signal via existing outbound channel failed:", e);
        }
      }

      // 2. One-off channel for quick signals (call-busy, call-reject, call-hangup)
      const topic = `call-signal:${targetUserId}`;
      const channel = supabase.channel(topic, {
        config: { broadcast: { self: false } },
      });

      let hasCleanedUp = false;
      const cleanupOneOff = () => {
        if (hasCleanedUp) return;
        hasCleanedUp = true;
        try {
          supabase.removeChannel(channel);
        } catch (e) {
          console.warn("Error removing one-off channel:", e);
        }
      };

      channel.subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          try {
            await channel.send({
              type: "broadcast",
              event,
              payload: fullPayload,
            });
          } catch (e) {
            console.error("Error sending one-off direct signal:", e);
          } finally {
            setTimeout(cleanupOneOff, 1000);
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          cleanupOneOff();
        }
        // NOTE: We intentionally do NOT call cleanupOneOff on status === "CLOSED",
        // because supabase.removeChannel triggers "CLOSED", which would cause recursion.
      });
    },
    [currentUser?.id, supabase]
  );

  // Start User Media (Microphone & Camera)
  const getUserMediaStream = useCallback(
    async (
      requestedType?: CallType,
      currentFacing?: "user" | "environment"
    ): Promise<MediaStream | null> => {
      const type = requestedType ?? callTypeRef.current;
      const facing = currentFacing ?? facingModeRef.current;

      try {
        if (
          localStreamRef.current &&
          localStreamRef.current.getTracks().some((t) => t.readyState === "live")
        ) {
          const hasAudio = localStreamRef.current
            .getAudioTracks()
            .some((t) => t.readyState === "live");
          const hasVideo = localStreamRef.current
            .getVideoTracks()
            .some((t) => t.readyState === "live");

          if (hasAudio && (type !== "video" || hasVideo)) {
            return localStreamRef.current;
          }
        }

        // Release old tracks when changing call mode
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video:
              type === "video"
                ? {
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    facingMode: facing,
                  }
                : false,
          });
        } catch (mediaErr) {
          if (type === "video") {
            console.warn("[WebRTC] Video stream request failed, falling back to audio only:", mediaErr);
            showToastRef.current?.(
              "تعذر تشغيل الكاميرا، جاري المتابعة بالصوت فقط",
              "info"
            );
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
          } else {
            throw mediaErr;
          }
        }

        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (err) {
        console.error("Media stream access error:", err);
        showToastRef.current?.(
          type === "video"
            ? "تعذر الوصول للميكروفون أو الكاميرا. يرجى التحقق من أذونات المتصفح."
            : "تعذر الوصول للميكروفون. يرجى التحقق من أذونات المتصفح.",
          "error"
        );
        return null;
      }
    },
    []
  );

  // Hang Up / Cancel Call
  const endCall = useCallback(async () => {
    const target = otherUserRef.current;
    const callId = currentCallIdRef.current;
    if (callId) {
      markCallEnded(callId);
    }

    if (invitePulseIntervalRef.current) {
      clearInterval(invitePulseIntervalRef.current);
      invitePulseIntervalRef.current = null;
    }
    if (outgoingTimeoutRef.current) {
      clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
    if (outboundSignalChannelRef.current) {
      supabase.removeChannel(outboundSignalChannelRef.current);
      outboundSignalChannelRef.current = null;
    }

    if (target && currentUser?.id) {
      const roomTopic = getCallRoomTopic(currentUser.id, target.id);
      sendRoomSignal("call-hangup", { callId });
      sendDirectSignal(target.id, "call-hangup", { roomTopic, callId });
    }

    if (isCallerRef.current) {
      if (callStateRef.current === "connected") {
        logCallMessage("answered", durationSecondsRef.current);
      } else if (callStateRef.current === "outgoing") {
        logCallMessage("missed");
      }
    }

    resetToIdle("ended", 1000);
  }, [currentUser?.id, sendRoomSignal, sendDirectSignal, resetToIdle, logCallMessage, markCallEnded, supabase]);

  // Initialize WebRTC Peer Connection
  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(cachedIceConfigRef.current);
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendRoomSignal("call-ice-candidate", { candidate: event.candidate.toJSON() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] ICE Connection State:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }
      }
    };

    pc.ontrack = (event) => {
      console.log("[WebRTC] ontrack event received:", event);
      let stream: MediaStream | null = null;
      if (event.streams && event.streams[0]) {
        stream = event.streams[0];
      } else if (event.track) {
        if (remoteStreamRef.current) {
          remoteStreamRef.current.addTrack(event.track);
          stream = remoteStreamRef.current;
        } else {
          stream = new MediaStream([event.track]);
        }
      }

      if (stream) {
        if (event.track && event.track.kind === "video") {
          event.track.onmute = () => {
            console.log("[WebRTC] remote video track muted");
          };
          event.track.onunmute = () => {
            console.log("[WebRTC] remote video track unmuted");
            setIsRemoteVideoOff(false);
          };
        }

        // Explicitly guarantee all remote audio tracks are unmuted and live
        stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        remoteStreamRef.current = stream;
        setRemoteStream(new MediaStream(stream.getTracks()));

        // Clear disconnect grace timer if media packets are arriving
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }

        playRemoteAudio();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("WebRTC connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }
      } else if (pc.connectionState === "disconnected") {
        // Transient disconnect on mobile cellular or NAT renegotiation
        // Allow a 10s grace period for ICE to recover before ending the call
        if (!disconnectGraceTimerRef.current) {
          disconnectGraceTimerRef.current = setTimeout(() => {
            if (pcRef.current?.connectionState === "disconnected") {
              console.warn("[WebRTC] Disconnected timeout reached. Ending call.");
              if (isCallerRef.current && callStateRef.current === "connected") {
                logCallMessage("answered", durationSecondsRef.current);
              }
              resetToIdle("ended", 1500);
            }
          }, 10000);
        }
      } else if (pc.connectionState === "failed") {
        // Attempt ICE restart once if supported
        if (typeof pc.restartIce === "function") {
          try {
            pc.restartIce();
          } catch {}
        }
        if (!disconnectGraceTimerRef.current) {
          disconnectGraceTimerRef.current = setTimeout(() => {
            if (pcRef.current?.connectionState === "failed") {
              console.warn("[WebRTC] Connection failed. Ending call.");
              showToastRef.current?.("تعذر توصيل مسار الصوت بين الشبكتين", "error");
              if (isCallerRef.current && callStateRef.current === "connected") {
                logCallMessage("answered", durationSecondsRef.current);
              }
              resetToIdle("ended", 1500);
            }
          }, 6000);
        }
      } else if (pc.connectionState === "closed") {
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }
        if (isCallerRef.current && callStateRef.current === "connected") {
          logCallMessage("answered", durationSecondsRef.current);
        }
        resetToIdle("ended", 1000);
      }
    };

    return pc;
  }, [sendRoomSignal, resetToIdle, logCallMessage, playRemoteAudio]);

  // Connect & Join Call Room Channel with full duplex signaling
  const joinCallRoom = useCallback(
    (roomTopic: string) => {
      if (roomChannelRef.current) {
        supabase.removeChannel(roomChannelRef.current);
      }

      isRoomSubscribedRef.current = false;
      const channel = supabase.channel(roomTopic, {
        config: { broadcast: { self: false } },
      });
      roomChannelRef.current = channel;

      channel
        .on("broadcast", { event: "call-accept" }, async ({ payload }: { payload?: Record<string, unknown> }) => {
          if (payload?.senderId === currentUser?.id) return;
          if (!isCallerRef.current) return;

          console.log("Room signal received: call-accept", payload);
          ringtoneManager.stopRingtone();

          // Stop invitation pulsing once call is accepted
          if (invitePulseIntervalRef.current) {
            clearInterval(invitePulseIntervalRef.current);
            invitePulseIntervalRef.current = null;
          }
          if (outgoingTimeoutRef.current) {
            clearTimeout(outgoingTimeoutRef.current);
            outgoingTimeoutRef.current = null;
          }

          const stream = await getUserMediaStream(callTypeRef.current);
          if (!stream) {
            endCall();
            return;
          }

          const pc = createPeerConnection();
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          try {
            const isVideo = callTypeRef.current === "video";
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: isVideo,
            });
            await pc.setLocalDescription(offer);
            sendRoomSignal("call-offer", { offer });
          } catch (err) {
            console.error("Error creating offer:", err);
            endCall();
          }
        })
        .on("broadcast", { event: "call-offer" }, async ({ payload }: { payload: { offer: RTCSessionDescriptionInit; senderId?: string } }) => {
          if (payload?.senderId === currentUser?.id) return;
          if (isCallerRef.current) return;

          console.log("Room signal received: call-offer");
          const { offer } = payload;
          const pc = createPeerConnection();

          const stream = await getUserMediaStream(callTypeRef.current);
          if (stream) {
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          }

          try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendRoomSignal("call-answer", { answer });

            // Apply buffered ICE candidates
            while (pendingIceCandidates.current.length > 0) {
              const cand = pendingIceCandidates.current.shift();
              if (cand) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (e) {
                  console.warn("Failed to add buffered ICE candidate:", e);
                }
              }
            }

            setCallState("connected");
            startTimer();
          } catch (err) {
            console.error("Error processing call-offer:", err);
            endCall();
          }
        })
        .on("broadcast", { event: "call-answer" }, async ({ payload }: { payload: { answer: RTCSessionDescriptionInit; senderId?: string } }) => {
          if (payload?.senderId === currentUser?.id) return;
          if (!isCallerRef.current) return;

          console.log("Room signal received: call-answer");
          const { answer } = payload;
          if (pcRef.current) {
            // Guard: in WebRTC, an answer can only be set when the peer is in "have-local-offer"
            if (pcRef.current.signalingState !== "have-local-offer") {
              console.warn("Ignoring call-answer because signalingState is:", pcRef.current.signalingState);
              return;
            }

            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));

              // Apply buffered ICE candidates
              while (pendingIceCandidates.current.length > 0) {
                const cand = pendingIceCandidates.current.shift();
                if (cand) {
                  try {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (e) {
                    console.warn("Failed to add buffered ICE candidate:", e);
                  }
                }
              }

              setCallState("connected");
              startTimer();
            } catch (err) {
              console.error("Error setting remote answer:", err);
              const currentState = pcRef.current?.signalingState as string | undefined;
              if (currentState !== "stable") {
                endCall();
              }
            }
          }
        })
        .on("broadcast", { event: "call-ice-candidate" }, async ({ payload }: { payload: { candidate: RTCIceCandidateInit; senderId?: string } }) => {
          if (payload?.senderId === currentUser?.id) return;
          const { candidate } = payload;
          if (!candidate) return;

          if (
            pcRef.current &&
            pcRef.current.remoteDescription &&
            pcRef.current.remoteDescription.type
          ) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
              console.warn("Error adding received ICE candidate:", err);
            }
          } else {
            pendingIceCandidates.current.push(candidate);
          }
        })
        .on("broadcast", { event: "call-busy" }, ({ payload }: { payload?: { callId?: string; senderId?: string } }) => {
          if (payload?.senderId === currentUser?.id) return;
          console.log("Room signal received: call-busy");
          handleCallBusy(payload);
        })
        .on("broadcast", { event: "call-hangup" }, ({ payload }: { payload?: { callId?: string; senderId?: string } }) => {
          if (payload?.senderId === currentUser?.id) return;
          console.log("Room signal received: call-hangup");
          handleCallHangup(payload);
        })
        .on("broadcast", { event: "call-reject" }, ({ payload }: { payload?: { callId?: string; senderId?: string } }) => {
          if (payload?.senderId === currentUser?.id) return;
          console.log("Room signal received: call-reject");
          handleCallRejected(payload);
        })
        .on("broadcast", { event: "call-video-toggle" }, ({ payload }: { payload?: { isVideoOff?: boolean; senderId?: string } }) => {
          if (payload?.senderId === currentUser?.id) return;
          console.log("Room signal received: call-video-toggle", payload);
          setIsRemoteVideoOff(Boolean(payload?.isVideoOff));
        })
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            isRoomSubscribedRef.current = true;
            // Flush any signals queued before subscription was confirmed
            while (pendingSignalsQueueRef.current.length > 0) {
              const msg = pendingSignalsQueueRef.current.shift();
              if (msg && roomChannelRef.current) {
                roomChannelRef.current.send({
                  type: "broadcast",
                  event: msg.event,
                  payload: msg.payload,
                }).catch((e) => console.error("Error flushing queued signal:", e));
              }
            }
          }
        });
    },
    [currentUser?.id, supabase, createPeerConnection, getUserMediaStream, sendRoomSignal, startTimer, handleCallBusy, handleCallHangup, handleCallRejected, endCall]
  );

  // Initiate an Outgoing Voice/Video Call
  const startCall = useCallback(
    async (targetUser: CallUser, type: CallType = "audio") => {
      if (!currentUser?.id) return;

      cleanupCall();

      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      currentCallIdRef.current = callId;
      hasLoggedCallRef.current = false;
      isCallerRef.current = true;
      conversationIdRef.current = targetUser.conversationId || null;
      durationSecondsRef.current = 0;
      setCallType(type);
      callTypeRef.current = type;
      setIsVideoOff(false);
      isVideoOffRef.current = false;
      setOtherUser(targetUser);
      setCallState("outgoing");
      ringtoneManager.startOutgoingRingtone();

      const roomTopic = getCallRoomTopic(currentUser.id, targetUser.id);
      joinCallRoom(roomTopic);

      // Prime and unlock audio on user click for mobile browser autoplay authorization
      unlockAudio();

      // Pre-warm microphone & camera permission on user click gesture
      getUserMediaStream(type);

      // Open persistent outbound signaling channel for this call session
      const targetInboxTopic = `call-signal:${targetUser.id}`;
      const outboundChannel = supabase.channel(targetInboxTopic, {
        config: { broadcast: { self: false } },
      });
      outboundSignalChannelRef.current = outboundChannel;

      // Listen for direct responses from target user (e.g. busy, reject, hangup)
      outboundChannel
        .on("broadcast", { event: "call-busy" }, ({ payload }: { payload?: { callId?: string } }) => {
          handleCallBusy(payload);
        })
        .on("broadcast", { event: "call-reject" }, ({ payload }: { payload?: { callId?: string } }) => {
          handleCallRejected(payload);
        })
        .on("broadcast", { event: "call-hangup" }, ({ payload }: { payload?: { callId?: string } }) => {
          handleCallHangup(payload);
        });

      const invitePayload = {
        callId,
        callType: type,
        callerUser: {
          id: currentUser.id,
          name:
            currentUser.user_metadata?.display_name ||
            currentUser.user_metadata?.username ||
            currentUser.email?.split("@")[0] ||
            "User",
          username:
            currentUser.user_metadata?.username ||
            currentUser.email?.split("@")[0] ||
            "user",
          avatarUrl:
            currentUser.user_metadata?.avatar_url ||
            `https://avatar.vercel.sh/${currentUser.id}`,
          conversationId: targetUser.conversationId,
        },
        roomTopic,
        conversationId: targetUser.conversationId,
        senderId: currentUser.id,
      };

      const sendInvitePulse = async () => {
        if (callStateRef.current !== "outgoing") return;
        try {
          await outboundChannel.send({
            type: "broadcast",
            event: "call-invite",
            payload: invitePayload,
          });
        } catch (e) {
          console.warn("Failed to dispatch call-invite pulse:", e);
        }
      };

      outboundChannel.subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await sendInvitePulse();

          // Pulse call-invite every 2.5 seconds to guarantee delivery even if receiver reconnects
          if (invitePulseIntervalRef.current) clearInterval(invitePulseIntervalRef.current);
          invitePulseIntervalRef.current = setInterval(() => {
            if (callStateRef.current === "outgoing") {
              sendInvitePulse();
            } else {
              if (invitePulseIntervalRef.current) {
                clearInterval(invitePulseIntervalRef.current);
                invitePulseIntervalRef.current = null;
              }
            }
          }, 2500);
        }
      });

      // Ringing timeout (45 seconds auto-hangup if unanswered)
      if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current === "outgoing") {
          showToastRef.current?.("لم يتم الرد على المكالمة", "info");
          endCall();
        }
      }, 45000);
    },
    [currentUser, cleanupCall, joinCallRoom, getUserMediaStream, supabase, handleCallBusy, handleCallRejected, handleCallHangup, endCall, unlockAudio]
  );

  // Accept an Incoming Voice/Video Call
  const acceptCall = useCallback(async () => {
    const caller = otherUserRef.current;
    if (!caller || !currentUser?.id) return;

    ringtoneManager.stopRingtone();

    // Prime and unlock audio on user click gesture (critical for iOS Safari and mobile Chrome)
    unlockAudio();

    const stream = await getUserMediaStream(callTypeRef.current);
    if (!stream) {
      const roomTopic = getCallRoomTopic(currentUser.id, caller.id);
      sendRoomSignal("call-reject");
      sendDirectSignal(caller.id, "call-reject", { roomTopic });
      resetToIdle("idle");
      return;
    }

    setCallState("connected");
    startTimer();

    // Signal accept to caller
    sendRoomSignal("call-accept");
  }, [currentUser?.id, getUserMediaStream, sendRoomSignal, sendDirectSignal, resetToIdle, startTimer, unlockAudio]);

  // Reject an Incoming Voice Call
  const rejectCall = useCallback(async () => {
    const caller = otherUserRef.current;
    const callId = currentCallIdRef.current;
    if (callId) {
      markCallEnded(callId);
    }
    if (caller && currentUser?.id) {
      const roomTopic = getCallRoomTopic(currentUser.id, caller.id);
      sendRoomSignal("call-reject", { callId });
      sendDirectSignal(caller.id, "call-reject", { roomTopic, callId });
    }
    ringtoneManager.stopRingtone();
    resetToIdle("idle");
  }, [currentUser?.id, sendRoomSignal, sendDirectSignal, resetToIdle, markCallEnded]);

  // Toggle Microphone Mute State
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      const nextMuted = !isMuted;
      audioTracks.forEach((track) => {
        track.enabled = !nextMuted;
      });
      setIsMuted(nextMuted);
    }
  }, [isMuted]);

  // Toggle Camera Video Track On/Off
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length === 0) return;
      const nextVideoOff = !isVideoOff;
      videoTracks.forEach((track) => {
        track.enabled = !nextVideoOff;
      });
      setIsVideoOff(nextVideoOff);
      isVideoOffRef.current = nextVideoOff;
      sendRoomSignal("call-video-toggle", { isVideoOff: nextVideoOff });
    }
  }, [isVideoOff, sendRoomSignal]);

  // Switch Facing Camera (Front / Environment)
  const switchCamera = useCallback(async () => {
    if (callTypeRef.current !== "video") return;
    if (isSwitchingCameraRef.current) return;
    isSwitchingCameraRef.current = true;

    const currentMode = facingModeRef.current;
    const nextMode: "user" | "environment" = currentMode === "user" ? "environment" : "user";

    try {
      // 1. Release active local video tracks first so mobile hardware camera lock is freed
      const oldVideoTracks = localStreamRef.current?.getVideoTracks() || [];
      oldVideoTracks.forEach((t) => {
        try {
          t.stop();
        } catch (e) {
          console.warn("Error stopping old video track:", e);
        }
      });

      // 2. Request new camera stream with fallback strategies
      let newStream: MediaStream | null = null;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: nextMode },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
          },
        });
      } catch (err1) {
        console.warn("[WebRTC] High-res switchCamera failed, trying basic constraints:", err1);
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: nextMode },
            },
          });
        } catch (err2) {
          console.warn("[WebRTC] Ideal facingMode failed, falling back to any video camera:", err2);
          newStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }
      }

      const newVideoTrack = newStream?.getVideoTracks()[0];
      if (!newVideoTrack) {
        throw new Error("No video track found in new stream");
      }

      // Preserve current camera mute state
      newVideoTrack.enabled = !isVideoOffRef.current;

      // 3. Update RTCPeerConnection sender
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        const videoSender =
          senders.find((s) => s.track && s.track.kind === "video") ||
          senders.find((s) => (s as any).kind === "video") ||
          pcRef.current.getTransceivers?.().find(
            (t) => t.sender?.track?.kind === "video" || t.receiver?.track?.kind === "video"
          )?.sender;

        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }

      // 4. Update localStreamRef and React state
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => {
          localStreamRef.current?.removeTrack(t);
        });
        localStreamRef.current.addTrack(newVideoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      } else {
        const stream = new MediaStream([newVideoTrack]);
        localStreamRef.current = stream;
        setLocalStream(stream);
      }

      facingModeRef.current = nextMode;
      setFacingMode(nextMode);
    } catch (err) {
      console.error("[WebRTC] Failed to switch camera:", err);
      // Attempt recovery of previous camera so user is not stuck on a black screen
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: currentMode } },
        });
        const fallbackTrack = fallbackStream.getVideoTracks()[0];
        if (fallbackTrack && localStreamRef.current) {
          fallbackTrack.enabled = !isVideoOffRef.current;
          localStreamRef.current.getVideoTracks().forEach((t) => {
            t.stop();
            localStreamRef.current?.removeTrack(t);
          });
          localStreamRef.current.addTrack(fallbackTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

          if (pcRef.current) {
            const senders = pcRef.current.getSenders();
            const videoSender =
              senders.find((s) => s.track && s.track.kind === "video") ||
              senders.find((s) => (s as any).kind === "video") ||
              pcRef.current.getTransceivers?.().find(
                (t) => t.sender?.track?.kind === "video" || t.receiver?.track?.kind === "video"
              )?.sender;
            if (videoSender) {
              await videoSender.replaceTrack(fallbackTrack);
            }
          }
        }
      } catch (recoverErr) {
        console.error("[WebRTC] Camera recovery also failed:", recoverErr);
      }
    } finally {
      isSwitchingCameraRef.current = false;
    }
  }, []);

  // Listen for Signaling Broadcast Messages on the personal inbox `call-signal:${currentUser.id}`
  useEffect(() => {
    if (!currentUser?.id) return;

    let mySignalChannel: RealtimeChannel | null = null;
    let isSubscribed = false;

    const setupSignalChannel = () => {
      if (mySignalChannel) {
        supabase.removeChannel(mySignalChannel);
      }

      const channel = supabase.channel(`call-signal:${currentUser.id}`, {
        config: { broadcast: { self: false } },
      });
      mySignalChannel = channel;

      channel
        .on("broadcast", { event: "call-invite" }, ({ payload }: { payload: { callerUser: CallUser; senderId: string; conversationId?: string; roomTopic?: string; callId: string; callType?: CallType } }) => {
          const { callerUser, senderId, conversationId, roomTopic, callId, callType: incomingType } = payload;
          const detectedType: CallType = incomingType === "video" ? "video" : "audio";

          // If this call was already ended or rejected, drop this delayed invite pulse immediately!
          if (callId && recentlyEndedCallIdsRef.current.has(callId)) {
            console.log("Ignoring call-invite for already ended/rejected callId:", callId);
            return;
          }

          // If we are already handling this exact call in incoming or connected state, ignore duplicate pulse
          if (
            currentCallIdRef.current === callId &&
            (callStateRef.current === "incoming" || callStateRef.current === "connected")
          ) {
            return;
          }

          // If currently in another call (incoming, outgoing, or connected), respond that user is busy
          if (callStateRef.current !== "idle") {
            sendDirectSignal(senderId, "call-busy", { callId });
            return;
          }

          currentCallIdRef.current = callId || `call_${Date.now()}`;
          hasLoggedCallRef.current = false;
          isCallerRef.current = false;
          conversationIdRef.current =
            conversationId || callerUser?.conversationId || null;
          durationSecondsRef.current = 0;

          setCallType(detectedType);
          callTypeRef.current = detectedType;
          setIsVideoOff(false);
          isVideoOffRef.current = false;

          setOtherUser(callerUser);
          setCallState("incoming");
          ringtoneManager.startIncomingRingtone();

          // Join the shared room for WebRTC negotiation
          const room = roomTopic || getCallRoomTopic(currentUser.id, callerUser.id);
          joinCallRoom(room);
        })
        .on("broadcast", { event: "call-busy" }, ({ payload }: { payload?: { callId?: string } }) => {
          handleCallBusy(payload);
        })
        .on("broadcast", { event: "call-reject" }, ({ payload }: { payload?: { callId?: string } }) => {
          handleCallRejected(payload);
        })
        .on("broadcast", { event: "call-hangup" }, ({ payload }: { payload?: { callId?: string } }) => {
          handleCallHangup(payload);
        })
        .subscribe((status: string, err?: Error) => {
          if (status === "SUBSCRIBED") {
            isSubscribed = true;
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            isSubscribed = false;
            console.warn(`[useAudioCall] Signal channel ${status}, will retry in 2s...`, err);
            setTimeout(() => {
              if (currentUser?.id) {
                setupSignalChannel();
              }
            }, 2000);
          }
        });
    };

    setupSignalChannel();

    // Re-verify and reconnect if tab becomes active after sleep/background
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !isSubscribed) {
        setupSignalChannel();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      if (mySignalChannel) {
        supabase.removeChannel(mySignalChannel);
      }
    };
  }, [
    currentUser?.id,
    supabase,
    joinCallRoom,
    sendDirectSignal,
    handleCallBusy,
    handleCallRejected,
    handleCallHangup,
  ]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  return {
    callState,
    callType,
    otherUser,
    durationSeconds,
    isMuted,
    isVideoOff,
    isRemoteVideoOff,
    facingMode,
    remoteStream,
    localStream,
    isAudioBlocked,
    playRemoteAudio,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    switchCamera,
    remoteAudioRef,
  };
}
