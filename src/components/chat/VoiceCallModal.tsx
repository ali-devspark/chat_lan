"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  Maximize2,
  Minimize2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AudioFrequencyVisualizer } from "@/components/chat/AudioFrequencyVisualizer";
import type { CallType } from "@/hooks/useAudioCall";

export type CallState =
  | "idle"
  | "incoming"
  | "outgoing"
  | "connected"
  | "ended"
  | "rejected"
  | "busy";

interface CallUser {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
}

interface VoiceCallModalProps {
  callState: CallState;
  callType?: CallType;
  otherUser: CallUser | null;
  durationSeconds: number;
  isMuted: boolean;
  isVideoOff?: boolean;
  isRemoteVideoOff?: boolean;
  facingMode?: "user" | "environment";
  onAccept: () => void;
  onReject: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onToggleVideo?: () => void;
  onSwitchCamera?: () => void;
  remoteAudioRef?: React.RefObject<HTMLAudioElement | null>;
  remoteStream?: MediaStream | null;
  localStream?: MediaStream | null;
  isAudioBlocked?: boolean;
  onUnblockAudio?: () => void;
}

export function VoiceCallModal({
  callState,
  callType = "audio",
  otherUser,
  durationSeconds,
  isMuted,
  isVideoOff = false,
  isRemoteVideoOff = false,
  facingMode = "user",
  onAccept,
  onReject,
  onEndCall,
  onToggleMute,
  onToggleVideo,
  onSwitchCamera,
  remoteStream = null,
  localStream = null,
  isAudioBlocked = false,
  onUnblockAudio,
}: VoiceCallModalProps) {
  const t = useTranslations("Call");

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // Reset controls visibility when call state changes
  useEffect(() => {
    setAreControlsVisible(true);
  }, [callState, callType]);

  // Bind remote stream to remote video element
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (el && remoteStream) {
      if (el.srcObject !== remoteStream) {
        el.srcObject = remoteStream;
      }
      el.play().catch((err) => console.warn("[VideoCall] Remote video playback error:", err));
    }
  }, [remoteStream, callState, callType, isRemoteVideoOff]);

  // Bind local stream to local PiP video element
  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStream) {
      if (el.srcObject !== localStream) {
        el.srcObject = localStream;
      }
      el.play().catch((err) => console.warn("[VideoCall] Local video playback error:", err));
    }
  }, [localStream, callState, callType, isVideoOff, facingMode]);

  // Bind preview stream while outgoing video call is ringing
  useEffect(() => {
    const el = previewVideoRef.current;
    if (el && localStream && callType === "video") {
      if (el.srcObject !== localStream) {
        el.srcObject = localStream;
      }
      el.play().catch((err) => console.warn("[VideoCall] Preview video playback error:", err));
    }
  }, [localStream, callState, callType, facingMode]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  if (callState === "idle" || !otherUser) return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isVideoCall = callType === "video";

  const getStatusText = () => {
    switch (callState) {
      case "incoming":
        return isVideoCall ? t("incomingVideoCall") : t("incomingCall");
      case "outgoing":
        return isVideoCall ? t("callingVideo") : t("calling");
      case "connected":
        return t("connected");
      case "ended":
        return t("callEnded");
      case "rejected":
        return t("callRejected");
      case "busy":
        return t("userBusy");
      default:
        return "";
    }
  };

  const isRemoteVideoShowing = Boolean(
    isVideoCall &&
      remoteStream &&
      !isRemoteVideoOff &&
      remoteStream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled)
  );

  const isLocalVideoShowing = Boolean(
    isVideoCall &&
      !isVideoOff &&
      localStream &&
      localStream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled)
  );

  // -------------------------------------------------------------
  // 1. VIDEO CALL VIEW (When connected or in active video session)
  // -------------------------------------------------------------
  if (isVideoCall && callState === "connected") {
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
      >
        <div className="relative w-full h-full sm:max-w-5xl sm:h-[86vh] bg-zinc-950 sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between border border-white/10 select-none">
          {/* Main Remote Video or Fallback Backdrop (Click to toggle controls visibility) */}
          <div
            className="absolute inset-0 w-full h-full bg-zinc-950 overflow-hidden flex items-center justify-center cursor-pointer"
            onClick={() => setAreControlsVisible((prev) => !prev)}
          >
            {/* Continuously mounted Remote Video to maintain WebRTC pipeline without black screen */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isRemoteVideoShowing ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            />

            {/* If remote camera is off or not sending video, show avatar backdrop */}
            {!isRemoteVideoShowing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 p-6 text-center z-10 animate-in fade-in duration-300">
                <div className="relative">
                  <span className="absolute -inset-4 rounded-full bg-primary/20 animate-ping opacity-70" />
                  <Avatar className="h-32 w-32 border-4 border-white/10 shadow-2xl relative z-10">
                    <AvatarImage src={otherUser.avatarUrl} />
                    <AvatarFallback className="text-4xl font-bold bg-primary text-primary-foreground">
                      {otherUser.name[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-white tracking-wide">{otherUser.name}</h3>
                  <p className="text-xs text-zinc-400">@{otherUser.username}</p>
                  <p className="text-xs text-amber-400/90 pt-1">
                    {t("cameraOff")} (صوت فقط حالياً)
                  </p>
                </div>
              </div>
            )}

            {/* Subtle Gradient Overlays for Controls Readability */}
            <div className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-10" />
            <div className="absolute inset-x-0 bottom-0 h-36 bg-linear-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-10" />
          </div>

          {/* Top Floating Header */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-20 flex items-center justify-between p-4 sm:p-6 pointer-events-auto"
          >
            <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 shadow-md">
              <Avatar className="h-8 w-8 border border-white/20">
                <AvatarImage src={otherUser.avatarUrl} />
                <AvatarFallback className="text-xs font-semibold bg-primary text-primary-foreground">
                  {otherUser.name[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-white leading-tight">
                  {otherUser.name}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-mono text-emerald-400">
                    {formatDuration(durationSeconds)}
                  </span>
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 text-white border border-white/10 backdrop-blur-md"
              title={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>

          {/* Picture-in-Picture (PiP) Floating Self View */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-20 ltr:right-4 rtl:left-4 z-20 w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-900/90 backdrop-blur-md transition-all duration-300 group pointer-events-auto"
          >
            {/* Always mounted local video element to preserve camera frame stream */}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                facingMode === "user" ? "scale-x-[-1]" : ""
              } ${isLocalVideoShowing ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            />

            {!isLocalVideoShowing && (
              <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-2 text-center bg-zinc-900 text-zinc-400 space-y-1">
                <VideoOff className="h-6 w-6 text-zinc-500" />
                <span className="text-[10px] font-medium text-zinc-400">{t("cameraOff")}</span>
              </div>
            )}

            <div className="absolute bottom-1.5 inset-x-1.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] text-white/90 text-center font-medium truncate pointer-events-none">
              أنت
            </div>
          </div>

          {/* Autoplay unblock button if mobile browser blocked audio */}
          {isAudioBlocked && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative z-30 px-4 pb-2 max-w-md mx-auto w-full pointer-events-auto"
            >
              <button
                type="button"
                onClick={onUnblockAudio}
                className="w-full py-2.5 px-4 rounded-2xl bg-amber-500/30 border border-amber-500/50 text-amber-200 text-xs font-semibold flex items-center justify-center gap-2 animate-pulse cursor-pointer hover:bg-amber-500/40 transition-all shadow-lg backdrop-blur-md"
              >
                <Volume2 className="h-4 w-4 shrink-0" />
                <span>انقر هنا لسماع صوت المتصل (حظر المتصفح الصوت تلقائياً)</span>
              </button>
            </div>
          )}

          {/* Bottom Floating Controls Area */}
          <div className="relative z-20 pb-4 sm:pb-6 flex flex-col items-center justify-center">
            {/* Dock with buttons (Collapsible downwards) */}
            <div
              onClick={(e) => e.stopPropagation()}
              className={`flex flex-col items-center gap-2 transition-all duration-300 ease-in-out ${
                areControlsVisible
                  ? "translate-y-0 opacity-100 pointer-events-auto"
                  : "translate-y-28 opacity-0 pointer-events-none"
              }`}
            >
              {/* Collapse button above dock */}
              <button
                type="button"
                onClick={() => setAreControlsVisible(false)}
                className="px-3 py-1 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md border border-white/10 text-white/80 hover:text-white text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                title={t("hideControls")}
              >
                <ChevronDown className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">{t("hideControls")}</span>
              </button>

              <div className="inline-flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 shadow-2xl">
                {/* Toggle Microphone */}
                <Button
                  type="button"
                  variant={isMuted ? "destructive" : "secondary"}
                  size="icon"
                  onClick={onToggleMute}
                  className="h-12 w-12 rounded-full shadow-md transition-transform active:scale-95"
                  title={isMuted ? t("unmute") : t("mute")}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>

                {/* Toggle Camera */}
                {onToggleVideo && (
                  <Button
                    type="button"
                    variant={isVideoOff ? "destructive" : "secondary"}
                    size="icon"
                    onClick={onToggleVideo}
                    className="h-12 w-12 rounded-full shadow-md transition-transform active:scale-95"
                    title={isVideoOff ? t("cameraOn") : t("cameraOff")}
                  >
                    {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                  </Button>
                )}

                {/* Switch Camera (Front/Rear on Mobile) */}
                {onSwitchCamera && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={onSwitchCamera}
                    className="h-12 w-12 rounded-full shadow-md transition-transform active:scale-95"
                    title={t("switchCamera")}
                  >
                    <RefreshCw className="h-5 w-5" />
                  </Button>
                )}

                {/* End Video Call Button */}
                <Button
                  type="button"
                  size="icon"
                  onClick={onEndCall}
                  className="h-13 w-13 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xl transition-transform active:scale-95"
                  title={t("endCall")}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </div>
            </div>

            {/* Expand / Show Controls Floating Button when collapsed */}
            {!areControlsVisible && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-6 inset-x-0 flex justify-center animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-auto"
              >
                <button
                  type="button"
                  onClick={() => setAreControlsVisible(true)}
                  className="px-4 py-2 rounded-full bg-black/75 hover:bg-black/95 backdrop-blur-xl border border-white/20 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  title={t("showControls")}
                >
                  <ChevronUp className="h-4 w-4" />
                  <span>{t("showControls")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. STANDARD AUDIO CALL & INCOMING/OUTGOING VIDEO CALL VIEW
  // -------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-card text-card-foreground border rounded-3xl max-w-sm w-full p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden space-y-5">
        {/* Subtle Background Glows */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Local Video Camera Preview while ringing in Outgoing Video Call */}
        {isVideoCall && callState === "outgoing" && localStream && (
          <div className="w-full h-36 rounded-2xl overflow-hidden border border-border/60 shadow-inner bg-black/50 relative mb-1">
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
            />
            <div className="absolute top-2 ltr:left-2 rtl:right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10px] text-white font-medium flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>معاينة الكاميرا</span>
            </div>
          </div>
        )}

        {/* User Avatar with Pulse Ring */}
        <div className="relative my-1">
          {(callState === "incoming" || callState === "outgoing" || callState === "connected") && (
            <span className="absolute -inset-3 rounded-full bg-primary/20 animate-ping opacity-75 pointer-events-none" />
          )}
          <Avatar className="h-24 w-24 border-4 border-background shadow-xl relative z-10">
            <AvatarImage src={otherUser.avatarUrl} />
            <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
              {otherUser.name[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>

          {/* Badge for Video Call */}
          {isVideoCall && (
            <div className="absolute -bottom-1 -right-1 z-20 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md border-2 border-background">
              <Video className="h-3.5 w-3.5" />
            </div>
          )}
        </div>

        {/* User Info & Call Status */}
        <div className="space-y-1.5 z-10">
          <h3 className="text-xl font-bold tracking-tight text-foreground">{otherUser.name}</h3>
          <p className="text-xs text-muted-foreground">@{otherUser.username}</p>

          <div className="pt-1.5">
            {callState === "connected" ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-semibold border border-emerald-500/20 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{formatDuration(durationSeconds)}</span>
              </div>
            ) : (
              <p
                className={`text-sm font-medium animate-pulse ${
                  callState === "busy"
                    ? "text-amber-500 font-semibold"
                    : callState === "rejected"
                    ? "text-destructive font-semibold"
                    : "text-primary"
                }`}
              >
                {getStatusText()}
              </p>
            )}
          </div>
        </div>

        {/* Real-time Audio Frequency Visualizer (When Connected in Audio Mode) */}
        {!isVideoCall && callState === "connected" && (
          <div className="w-full z-10 pt-1 space-y-2">
            <AudioFrequencyVisualizer
              stream={remoteStream}
              isActive={callState === "connected"}
              isMuted={isMuted}
            />

            {/* Mobile Browser Autoplay Unblock Button */}
            {isAudioBlocked && (
              <button
                type="button"
                onClick={onUnblockAudio}
                className="w-full py-2.5 px-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-semibold flex items-center justify-center gap-2 animate-pulse cursor-pointer hover:bg-amber-500/30 transition-all shadow-sm"
              >
                <Volume2 className="h-4 w-4 shrink-0" />
                <span>انقر هنا لسماع صوت المتصل (حظر المتصفح الصوت تلقائياً)</span>
              </button>
            )}
          </div>
        )}

        {/* Action Controls */}
        <div className="w-full pt-3 z-10">
          {callState === "incoming" ? (
            /* Incoming Call Controls: Accept or Decline */
            <div className="flex items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-1.5">
                <Button
                  size="icon"
                  onClick={onReject}
                  className="h-14 w-14 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg transition-transform active:scale-95"
                  title={t("decline")}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <span className="text-xs font-medium text-muted-foreground">{t("decline")}</span>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <Button
                  size="icon"
                  onClick={onAccept}
                  className="h-14 w-14 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg transition-transform active:scale-95 animate-bounce"
                  title={t("accept")}
                >
                  {isVideoCall ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
                </Button>
                <span className="text-xs font-medium text-muted-foreground">{t("accept")}</span>
              </div>
            </div>
          ) : callState === "outgoing" ? (
            /* Outgoing Call Controls: Cancel */
            <div className="flex flex-col items-center gap-1.5">
              <Button
                size="icon"
                onClick={onEndCall}
                className="h-14 w-14 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg transition-transform active:scale-95"
                title={t("endCall")}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <span className="text-xs font-medium text-muted-foreground">{t("endCall")}</span>
            </div>
          ) : callState === "connected" ? (
            /* Connected Audio Call Controls: Mute/Unmute & Hang up with collapse/expand */
            <div className="w-full space-y-2">
              {areControlsVisible ? (
                <div className="flex flex-col items-center space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="flex items-center justify-center gap-6">
                    <div className="flex flex-col items-center gap-1.5">
                      <Button
                        variant={isMuted ? "destructive" : "secondary"}
                        size="icon"
                        onClick={onToggleMute}
                        className="h-12 w-12 rounded-full shadow-md transition-all active:scale-95"
                        title={isMuted ? t("unmute") : t("mute")}
                      >
                        {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                      </Button>
                      <span className="text-xs font-medium text-muted-foreground">
                        {isMuted ? t("unmute") : t("mute")}
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                      <Button
                        size="icon"
                        onClick={onEndCall}
                        className="h-14 w-14 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg transition-transform active:scale-95"
                        title={t("endCall")}
                      >
                        <PhoneOff className="h-6 w-6" />
                      </Button>
                      <span className="text-xs font-medium text-muted-foreground">{t("endCall")}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAreControlsVisible(false)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1"
                    title={t("hideControls")}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span>{t("hideControls")}</span>
                  </button>
                </div>
              ) : (
                <div className="flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAreControlsVisible(true)}
                    className="rounded-full text-xs flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                    title={t("showControls")}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span>{t("showControls")}</span>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* Ended / Rejected / Busy State */
            <div className="py-2">
              <p
                className={`text-sm font-semibold ${
                  callState === "busy"
                    ? "text-amber-500"
                    : callState === "rejected"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {getStatusText()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
