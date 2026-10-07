"use client";

import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

export type CallState = "idle" | "incoming" | "outgoing" | "connected" | "ended" | "rejected" | "busy";

interface CallUser {
  id: string;
  name: string;
  username: string;
  avatarUrl: string;
}

interface VoiceCallModalProps {
  callState: CallState;
  otherUser: CallUser | null;
  durationSeconds: number;
  isMuted: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement | null>;
}

export function VoiceCallModal({
  callState,
  otherUser,
  durationSeconds,
  isMuted,
  onAccept,
  onReject,
  onEndCall,
  onToggleMute,
  remoteAudioRef,
}: VoiceCallModalProps) {
  const t = useTranslations("Call");

  if (callState === "idle" || !otherUser) return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusText = () => {
    switch (callState) {
      case "incoming":
        return t("incomingCall");
      case "outgoing":
        return t("calling");
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      {/* Hidden Audio Element for WebRTC Remote Stream */}
      <audio ref={remoteAudioRef} autoPlay style={{ display: "none" }} />

      <div className="bg-card text-card-foreground border rounded-3xl max-w-sm w-full p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden space-y-6">
        {/* Subtle Background Glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* User Avatar with Pulse Ring */}
        <div className="relative my-2">
          {(callState === "incoming" || callState === "outgoing" || callState === "connected") && (
            <span className="absolute -inset-3 rounded-full bg-primary/20 animate-ping opacity-75 pointer-events-none" />
          )}
          <Avatar className="h-28 w-28 border-4 border-background shadow-xl relative z-10">
            <AvatarImage src={otherUser.avatarUrl} />
            <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
              {otherUser.name[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* User Info & Call Status */}
        <div className="space-y-1.5 z-10">
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            {otherUser.name}
          </h3>
          <p className="text-xs text-muted-foreground">@{otherUser.username}</p>

          <div className="pt-2">
            {callState === "connected" ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-semibold border border-emerald-500/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{formatDuration(durationSeconds)}</span>
              </div>
            ) : (
              <p className="text-sm font-medium text-primary animate-pulse">
                {getStatusText()}
              </p>
            )}
          </div>
        </div>

        {/* Live Audio Visualizer Equalizer Effect (When Connected) */}
        {callState === "connected" && (
          <div className="flex items-center justify-center gap-1.5 h-8 py-1">
            <span className="w-1.5 h-4 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-7 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-5 bg-emerald-500 rounded-full animate-bounce" />
            <span className="w-1.5 h-8 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.25s]" />
            <span className="w-1.5 h-4 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.1s]" />
          </div>
        )}

        {/* Action Controls */}
        <div className="w-full pt-4 z-10">
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
                  <Phone className="h-6 w-6" />
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
            /* Connected Active Call Controls: Mute/Unmute & Hang up */
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
          ) : (
            /* Ended / Rejected / Busy State */
            <div className="py-2">
              <p className="text-sm font-semibold text-muted-foreground">
                {getStatusText()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
