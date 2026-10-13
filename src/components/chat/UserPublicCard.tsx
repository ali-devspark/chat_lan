"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  MessageSquare,
  Copy,
  Check,
  AtSign,
  Sparkles,
  Link2,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface PublicUserProfile {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  status?: string;
}

export interface UserPublicCardProps {
  user: PublicUserProfile;
  isOnline?: boolean;
  onStartChat: () => void | Promise<void>;
  isLoadingAction?: boolean;
  isCurrentUser?: boolean;
  className?: string;
}

export function UserPublicCard({
  user,
  isOnline = false,
  onStartChat,
  isLoadingAction = false,
  isCurrentUser = false,
  className = "",
}: UserPublicCardProps) {
  const t = useTranslations("Profile");

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);

  const displayName = user.display_name || `@${user.username}`;
  const avatarUrl = user.avatar_url || `https://avatar.vercel.sh/${user.username}`;

  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://chat-lan.netlify.app";
  const shortLink = `${origin}/u/${user.username}`;

  const handleCopyShortLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(shortLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyUsername = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`@${user.username}`);
      setCopiedUsername(true);
      setTimeout(() => setCopiedUsername(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border/70 bg-linear-to-b from-card/95 via-card/85 to-background/95 p-5 sm:p-6 shadow-xl backdrop-blur-md transition-all duration-300 text-center max-w-sm w-full mx-auto ${className}`}
    >
      {/* Decorative ambient background glow */}
      <div className="absolute -top-20 -left-20 w-36 h-36 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Avatar Container with Online Indicator */}
      <div className="relative inline-block mx-auto mb-3">
        <div className="relative p-0.5 rounded-full bg-linear-to-tr from-primary/80 via-primary/30 to-transparent shadow-md">
          <Avatar className="h-20 w-20 sm:h-22 sm:w-22 border-3 border-background shadow-sm">
            <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
            <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Online / Offline status dot */}
        <span
          className={`absolute bottom-1 inset-e-1 h-4 w-4 rounded-full border-2 border-background ring-1 ring-background transition-all ${
            isOnline ? "bg-emerald-500 shadow-emerald-500/50 shadow-sm animate-pulse" : "bg-muted-foreground/40"
          }`}
          title={isOnline ? t("userStatusOnline") : t("userStatusOffline")}
        />
      </div>

      {/* User Name & Handle */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center justify-center gap-1.5">
          <h3 className="font-extrabold text-lg sm:text-xl text-foreground tracking-tight truncate max-w-60">
            {displayName}
          </h3>
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
        </div>

        {/* Username Chip (Click to Copy) */}
        <button
          type="button"
          onClick={handleCopyUsername}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary text-xs font-mono font-medium transition-colors cursor-pointer group"
          title="نسخ اسم المستخدم"
        >
          <AtSign className="h-3 w-3" />
          <span>{user.username}</span>
          {copiedUsername ? (
            <Check className="h-3 w-3 text-emerald-500 animate-in zoom-in-75" />
          ) : (
            <Copy className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
      </div>

      {/* Status / Bio Badges */}
      <div className="mb-3.5 flex flex-wrap items-center justify-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
            isOnline
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-muted/60 border-border/70 text-muted-foreground"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isOnline ? "bg-emerald-500" : "bg-muted-foreground/50"
            }`}
          />
          <span>{isOnline ? t("userStatusOnline") : t("userStatusOffline")}</span>
        </span>

        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-accent/60 border border-border/50 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          <span>{t("userStatusAvailable")}</span>
        </span>
      </div>

      {/* Short Link Display (Telegram Style) */}
      <div className="mb-4 p-2 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground ps-1">
          <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-mono text-[11px] truncate select-all" dir="ltr">
            {shortLink.replace(/^https?:\/\//, "")}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant={copiedLink ? "default" : "secondary"}
          onClick={handleCopyShortLink}
          className={`h-6.5 px-2.5 rounded-lg text-[11px] gap-1 shrink-0 cursor-pointer transition-all ${
            copiedLink ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
          }`}
        >
          {copiedLink ? (
            <>
              <Check className="h-3 w-3" />
              <span>{t("linkCopied")}</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>{t("copyLink")}</span>
            </>
          )}
        </Button>
      </div>

      {/* Action Button: Send Message / Start Chat */}
      {!isCurrentUser ? (
        <div className="pt-0.5">
          <Button
            type="button"
            onClick={onStartChat}
            disabled={isLoadingAction}
            className="w-full h-10 sm:h-11 rounded-xl font-bold text-sm gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20 cursor-pointer transition-transform active:scale-[0.98]"
          >
            {isLoadingAction ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            <span>{t("sendMessage")}</span>
          </Button>
        </div>
      ) : (
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
          هذا ملفك الشخصي في المنصة
        </div>
      )}
    </div>
  );
}
