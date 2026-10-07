"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ringtoneManager } from "@/lib/webrtc/ringtone";
import { CallState } from "@/components/chat/VoiceCallModal";

export interface CallUser {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
  conversationId?: string;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
};

export function useAudioCall(currentUser: any, showToast?: (msg: string, type?: "success" | "error" | "info") => void) {
  const supabase = createClient();
  const [callState, setCallState] = useState<CallState>("idle");
  const [otherUser, setOtherUser] = useState<CallUser | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const pendingIceCandidates = useRef<RTCIceCandidateInit[]>([]);
  const timerIntervalRef = useRef<any>(null);

  const callStateRef = useRef<CallState>("idle");
  const otherUserRef = useRef<CallUser | null>(null);
  const isCallerRef = useRef<boolean>(false);
  const conversationIdRef = useRef<string | null>(null);
  const durationSecondsRef = useRef<number>(0);

  // Synchronize state refs for callbacks
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    otherUserRef.current = otherUser;
  }, [otherUser]);

  useEffect(() => {
    durationSecondsRef.current = durationSeconds;
  }, [durationSeconds]);

  // Log Call Message into Supabase `messages` table
  const logCallMessage = useCallback(
    async (type: "answered" | "rejected" | "missed" | "busy", duration: number = 0) => {
      const convId = conversationIdRef.current;
      if (!convId || !currentUser?.id || !isCallerRef.current) return;

      let content = "";
      if (type === "answered") {
        content = `[call_log:answered:${duration}]`;
      } else if (type === "rejected") {
        content = `[call_log:rejected]`;
      } else if (type === "missed") {
        content = `[call_log:missed]`;
      } else if (type === "busy") {
        content = `[call_log:busy]`;
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

  // Helper to send WebRTC signaling broadcast to a target user
  const sendSignal = useCallback(
    async (targetUserId: string, event: string, payload: any = {}) => {
      if (!currentUser?.id) return;
      const targetChannel = supabase.channel(`call-signal:${targetUserId}`, {
        config: { broadcast: { self: false } },
      });

      await targetChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await targetChannel.send({
            type: "broadcast",
            event,
            payload: {
              ...payload,
              senderId: currentUser.id,
            },
          });
          setTimeout(() => {
            supabase.removeChannel(targetChannel);
          }, 1000);
        }
      });
    },
    [currentUser?.id, supabase]
  );

  // Clean up WebRTC peer connection, local streams, timers & ringtones
  const cleanupCall = useCallback(() => {
    ringtoneManager.stopRingtone();

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    pendingIceCandidates.current = [];
    setDurationSeconds(0);
    setIsMuted(false);
  }, []);

  // Reset call to idle state after brief notification delay
  const resetToIdle = useCallback(
    (newState: CallState = "idle", delayMs: number = 0) => {
      setCallState(newState);
      if (delayMs > 0) {
        setTimeout(() => {
          cleanupCall();
          setCallState("idle");
          setOtherUser(null);
        }, delayMs);
      } else {
        cleanupCall();
        setCallState("idle");
        setOtherUser(null);
      }
    },
    [cleanupCall]
  );

  // Start Call Timer
  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setDurationSeconds(0);
    timerIntervalRef.current = setInterval(() => {
      setDurationSeconds((prev) => prev + 1);
    }, 1000);
  }, []);

  // Initialize WebRTC Peer Connection
  const createPeerConnection = useCallback(
    (targetUserId: string) => {
      if (pcRef.current) {
        pcRef.current.close();
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(targetUserId, "call-ice-candidate", { candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
          if (isCallerRef.current && callStateRef.current === "connected") {
            logCallMessage("answered", durationSecondsRef.current);
          }
          resetToIdle("ended", 1500);
        }
      };

      return pc;
    },
    [sendSignal, resetToIdle, logCallMessage]
  );

  // Start User Media (Microphone)
  const getMicrophoneStream = async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error("Microphone access error:", err);
      if (showToast) {
        showToast("Microphone access denied. Please check browser permissions.", "error");
      }
      return null;
    }
  };

  // Initiate an Outgoing Voice Call
  const startCall = useCallback(
    async (targetUser: CallUser) => {
      if (!currentUser?.id) return;

      cleanupCall();
      isCallerRef.current = true;
      conversationIdRef.current = targetUser.conversationId || null;
      durationSecondsRef.current = 0;
      setOtherUser(targetUser);
      setCallState("outgoing");
      ringtoneManager.startOutgoingRingtone();

      await sendSignal(targetUser.id, "call-invite", {
        callerUser: {
          id: currentUser.id,
          name: currentUser.user_metadata?.display_name || currentUser.user_metadata?.username || currentUser.email?.split("@")[0] || "User",
          username: currentUser.user_metadata?.username || currentUser.email?.split("@")[0] || "user",
          avatarUrl: currentUser.user_metadata?.avatar_url || `https://avatar.vercel.sh/${currentUser.id}`,
          conversationId: targetUser.conversationId,
        },
        conversationId: targetUser.conversationId,
      });
    },
    [currentUser, sendSignal, cleanupCall]
  );

  // Accept an Incoming Voice Call
  const acceptCall = useCallback(async () => {
    const caller = otherUserRef.current;
    if (!caller || !currentUser?.id) return;

    ringtoneManager.stopRingtone();

    const stream = await getMicrophoneStream();
    if (!stream) {
      await sendSignal(caller.id, "call-reject");
      resetToIdle("idle");
      return;
    }

    setCallState("connected");
    startTimer();

    await sendSignal(caller.id, "call-accept");
  }, [currentUser, sendSignal, resetToIdle, startTimer]);

  // Reject an Incoming Voice Call
  const rejectCall = useCallback(async () => {
    const caller = otherUserRef.current;
    if (caller) {
      await sendSignal(caller.id, "call-reject");
    }
    resetToIdle("idle");
  }, [sendSignal, resetToIdle]);

  // Hang Up / Cancel Call
  const endCall = useCallback(async () => {
    const target = otherUserRef.current;
    if (target) {
      await sendSignal(target.id, "call-hangup");
    }

    if (isCallerRef.current) {
      if (callStateRef.current === "connected") {
        logCallMessage("answered", durationSecondsRef.current);
      } else if (callStateRef.current === "outgoing") {
        logCallMessage("missed");
      }
    }

    resetToIdle("ended", 1000);
  }, [sendSignal, resetToIdle, logCallMessage]);

  // Toggle Microphone Mute State
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Listen for Signaling Broadcast Messages on `call-signal:${currentUser.id}`
  useEffect(() => {
    if (!currentUser?.id) return;

    const mySignalChannel = supabase.channel(`call-signal:${currentUser.id}`, {
      config: { broadcast: { self: false } },
    });

    mySignalChannel
      .on("broadcast", { event: "call-invite" }, ({ payload }) => {
        const { callerUser, senderId, conversationId } = payload;
        if (callStateRef.current !== "idle") {
          sendSignal(senderId, "call-busy");
          return;
        }

        isCallerRef.current = false;
        conversationIdRef.current = conversationId || callerUser?.conversationId || null;
        durationSecondsRef.current = 0;

        setOtherUser(callerUser);
        setCallState("incoming");
        ringtoneManager.startIncomingRingtone();
      })
      .on("broadcast", { event: "call-busy" }, () => {
        if (isCallerRef.current) {
          logCallMessage("busy");
        }
        ringtoneManager.stopRingtone();
        if (showToast) showToast("User is busy in another call", "info");
        resetToIdle("busy", 2000);
      })
      .on("broadcast", { event: "call-reject" }, () => {
        if (isCallerRef.current) {
          logCallMessage("rejected");
        }
        ringtoneManager.stopRingtone();
        if (showToast) showToast("Call rejected", "info");
        resetToIdle("rejected", 2000);
      })
      .on("broadcast", { event: "call-hangup" }, () => {
        ringtoneManager.stopRingtone();
        if (showToast) showToast("Call ended", "info");
        if (isCallerRef.current) {
          if (callStateRef.current === "connected") {
            logCallMessage("answered", durationSecondsRef.current);
          } else if (callStateRef.current === "outgoing") {
            logCallMessage("missed");
          }
        }
        resetToIdle("ended", 1500);
      })
      .on("broadcast", { event: "call-accept" }, async ({ payload }) => {
        ringtoneManager.stopRingtone();
        const receiverId = payload.senderId;

        const stream = await getMicrophoneStream();
        if (!stream) {
          endCall();
          return;
        }

        const pc = createPeerConnection(receiverId);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(receiverId, "call-offer", { offer });
        } catch (err) {
          console.error("Error creating offer:", err);
          endCall();
        }
      })
      .on("broadcast", { event: "call-offer" }, async ({ payload }) => {
        const { offer, senderId } = payload;
        const pc = createPeerConnection(senderId);

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
        }

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(senderId, "call-answer", { answer });

          while (pendingIceCandidates.current.length > 0) {
            const cand = pendingIceCandidates.current.shift();
            if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand));
          }

          setCallState("connected");
          startTimer();
        } catch (err) {
          console.error("Error setting offer / creating answer:", err);
          endCall();
        }
      })
      .on("broadcast", { event: "call-answer" }, async ({ payload }) => {
        const { answer } = payload;
        if (pcRef.current) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));

            while (pendingIceCandidates.current.length > 0) {
              const cand = pendingIceCandidates.current.shift();
              if (cand) await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
            }

            setCallState("connected");
            startTimer();
          } catch (err) {
            console.error("Error setting remote answer:", err);
            endCall();
          }
        }
      })
      .on("broadcast", { event: "call-ice-candidate" }, async ({ payload }) => {
        const { candidate } = payload;
        if (pcRef.current && pcRef.current.remoteDescription) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Error adding ice candidate:", err);
          }
        } else {
          pendingIceCandidates.current.push(candidate);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(mySignalChannel);
    };
  }, [currentUser?.id, sendSignal, createPeerConnection, resetToIdle, startTimer, endCall, showToast, logCallMessage]);

  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  return {
    callState,
    otherUser,
    durationSeconds,
    isMuted,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    remoteAudioRef,
  };
}
