"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import {
  X,
  Copy,
  Check,
  Share2,
  ExternalLink,
  User,
  Mail,
  AtSign,
  Edit3,
  Link2,
  Zap,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: SupabaseUser | null;
  userProfile: {
    display_name: string;
    avatar_url: string;
    username: string;
  } | null;
  onOpenSettings?: () => void;
}

export function UserProfileModal({
  isOpen,
  onClose,
  user,
  userProfile,
  onOpenSettings,
}: UserProfileModalProps) {
  const t = useTranslations("Profile");
  const params = useParams();
  const locale = (params?.locale as string) || "ar";

  const [copiedShort, setCopiedShort] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Reset copied states on open
  useEffect(() => {
    if (isOpen) {
      setCopiedShort(false);
      setCopiedFull(false);
      setShareFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen || !user) return null;

  const username =
    userProfile?.username ||
    user.user_metadata?.username ||
    user.email?.split("@")[0] ||
    "user";
  const displayName =
    userProfile?.display_name ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    `@${username}`;
  const avatarUrl =
    userProfile?.avatar_url ||
    user.user_metadata?.avatar_url ||
    `https://avatar.vercel.sh/${username}`;
  const email = user.email || "";

  // Base origin
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://chat-lan.netlify.app";

  // 1. Short Link (Telegram style: /u/username)
  const shortLinkUrl = `${origin}/u/${username}`;

  // 2. Full Direct Chat Link (e.g. /ar/chat/username)
  const directChatUrl = `${origin}/${locale}/chat/${username}`;

  const handleCopy = async (text: string, type: "short" | "full") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "short") {
        setCopiedShort(true);
        setTimeout(() => setCopiedShort(false), 2500);
      } else {
        setCopiedFull(true);
        setTimeout(() => setCopiedFull(false), 2500);
      }
      setShareFeedback(t("linkCopied"));
      setTimeout(() => setShareFeedback(null), 2500);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      if (type === "short") setCopiedShort(true);
      else setCopiedFull(true);
      setTimeout(() => {
        setCopiedShort(false);
        setCopiedFull(false);
      }, 2500);
    }
  };

  const handleShare = async (urlToShare: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t("shareTitle"),
          text: `${t("shareText")} @${username}`,
          url: urlToShare,
        });
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          handleCopy(urlToShare, "short");
        }
      }
    } else {
      handleCopy(urlToShare, "short");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div
        className="bg-background border border-border/80 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative space-y-0 animate-in zoom-in-95 duration-200 flex flex-col max-h-[94vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="relative p-6 sm:p-7 bg-linear-to-br from-primary/15 via-primary/5 to-transparent border-b border-border/60">
          <button
            onClick={onClose}
            className="absolute top-5 inset-e-5 text-muted-foreground hover:text-foreground rounded-full p-2 hover:bg-background/80 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">{t("close")}</span>
          </button>

          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg sm:text-xl leading-tight">{t("title")}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t("subtitle")}</p>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 sm:p-7 space-y-6 overflow-y-auto">
          {/* User Profile Info Card (Spacious, Clean, No unnecessary badges) */}
          <div className="flex items-center gap-4 sm:gap-5 p-4 sm:p-5 rounded-2xl bg-muted/40 border border-border/70 shadow-2xs">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-primary/30 shadow-md shrink-0">
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0 space-y-1.5">
              <h4 className="font-bold text-base sm:text-lg text-foreground truncate">
                {displayName}
              </h4>
              <p className="text-xs sm:text-sm font-mono text-primary font-medium truncate flex items-center gap-1.5" dir="ltr">
                <AtSign className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>{username}</span>
              </p>
              {email && (
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5" dir="ltr">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{email}</span>
                </p>
              )}
            </div>
          </div>

          {/* Section 1: Telegram-Style Short Link (الرابط المختصر السريع) */}
          <div className="space-y-3 p-4 sm:p-5 rounded-2xl bg-linear-to-br from-primary/10 via-primary/5 to-background border border-primary/25 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-foreground">
                  <Zap className="h-4 w-4 text-amber-500 fill-amber-500/20" />
                  {t("shortLink")}
                </span>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                  {t("shortLinkDesc")}
                </p>
              </div>
            </div>

            {/* Input + Copy Button Beside It */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Input
                  type="text"
                  readOnly
                  value={shortLinkUrl}
                  dir="ltr"
                  className="w-full text-xs sm:text-sm font-mono py-2.5 px-3 rounded-xl bg-background border-border text-foreground selection:bg-primary/25 select-all focus-visible:ring-1 focus-visible:ring-primary/40 font-medium"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              </div>

              <Button
                type="button"
                variant={copiedShort ? "default" : "secondary"}
                onClick={() => handleCopy(shortLinkUrl, "short")}
                className={`h-10 px-4 text-xs font-semibold rounded-xl shrink-0 gap-1.5 cursor-pointer transition-all shadow-xs ${
                  copiedShort
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "hover:bg-primary hover:text-primary-foreground"
                }`}
              >
                {copiedShort ? (
                  <>
                    <Check className="h-4 w-4 text-white" />
                    <span>{t("linkCopied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>{t("copyLink")}</span>
                  </>
                )}
              </Button>
            </div>

            {/* Share and Open in New Tab Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleShare(shortLinkUrl)}
                className="flex-1 text-xs rounded-xl h-9 gap-1.5 cursor-pointer font-medium hover:bg-accent/80"
              >
                <Share2 className="h-3.5 w-3.5 text-primary" />
                <span>{t("shareLink")}</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => window.open(shortLinkUrl, "_blank")}
                className="text-xs rounded-xl h-9 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{t("openChat")}</span>
              </Button>
            </div>
          </div>

          {/* Section 2: Direct Full Chat Link */}
          <div className="space-y-2.5 p-4 rounded-2xl bg-muted/30 border border-border/60">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{t("personalChatLink")}</span>
            </Label>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("personalChatLinkDesc")}
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Input
                  type="text"
                  readOnly
                  value={directChatUrl}
                  dir="ltr"
                  className="w-full text-xs font-mono py-2 px-3 rounded-xl bg-background border-border text-muted-foreground selection:bg-primary/20 select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              </div>

              <Button
                type="button"
                variant={copiedFull ? "default" : "outline"}
                size="sm"
                onClick={() => handleCopy(directChatUrl, "full")}
                className={`h-9 px-3 text-xs font-medium rounded-xl shrink-0 gap-1.5 cursor-pointer transition-all ${
                  copiedFull ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
                }`}
              >
                {copiedFull ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>{t("linkCopied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{t("copyLink")}</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Feedback banner */}
          {shareFeedback && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center justify-center gap-2 animate-in fade-in">
              <Check className="h-4 w-4" />
              <span>{shareFeedback}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t bg-muted/20 flex items-center justify-between gap-3">
          {onOpenSettings ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="rounded-xl text-xs gap-1.5 cursor-pointer font-medium"
            >
              <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{t("editProfile")}</span>
            </Button>
          ) : (
            <div />
          )}

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onClose}
            className="rounded-xl text-xs min-w-24 cursor-pointer font-semibold shadow-xs"
          >
            {t("close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
