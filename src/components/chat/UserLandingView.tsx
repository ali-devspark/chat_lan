"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { UserPublicCard, PublicUserProfile } from "./UserPublicCard";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ArrowRight, MessageSquareDashed } from "lucide-react";
import Link from "next/link";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function UserLandingView({ targetUsername }: { targetUsername?: string }) {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "ar";
  const rawUsername = (targetUsername || (params?.username as string) || "").trim();
  const cleanUsername = decodeURIComponent(rawUsername).replace(/^@/, "").trim().toLowerCase();

  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // 1. Get current session
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setCurrentUser(user);

        // 2. Fetch target user profile
        if (!cleanUsername) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .ilike("username", cleanUsername)
          .maybeSingle();

        if (error || !data) {
          setNotFound(true);
        } else {
          setProfile(data as PublicUserProfile);
        }
      } catch (err) {
        console.error("Error loading user profile landing:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [cleanUsername, supabase]);

  const handleStartChat = () => {
    setIsActionLoading(true);
    const targetUrl = `/${locale}/chat/${cleanUsername}`;
    if (!currentUser) {
      window.location.href = `/${locale}/login?next=${encodeURIComponent(targetUrl)}`;
    } else {
      window.location.href = targetUrl;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">جاري فتح بطاقة المستخدم...</p>
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center p-4 text-center">
        <div className="p-5 rounded-2xl bg-muted/40 border border-border/80 max-w-sm w-full space-y-4">
          <div className="h-14 w-14 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
            <MessageSquareDashed className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-base">المستخدم غير موجود</h3>
            <p className="text-xs text-muted-foreground">
              لم نتمكن من العثور على حساب بالاسم المميز <code>@{cleanUsername}</code>
            </p>
          </div>
          <Link href={`/${locale}/chat`}>
            <Button className="w-full rounded-xl text-xs font-semibold cursor-pointer">
              الذهاب إلى شاشة المحادثات
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 py-4 sm:py-6 min-h-[calc(100dvh-5rem)]">
      <div className="w-full max-w-sm space-y-3">
        {/* Navigation link back to chat */}
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <Link
            href={`/${locale}/chat`}
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            {locale === "ar" ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
            <span>{locale === "ar" ? "العودة للدردشة" : "Back to Chat"}</span>
          </Link>
          <span className="font-mono text-[11px] text-primary">ChatLan Direct</span>
        </div>

        {/* The Compact Public User Card */}
        <UserPublicCard
          user={profile}
          onStartChat={handleStartChat}
          isLoadingAction={isActionLoading}
          isCurrentUser={currentUser?.id === profile.id}
        />
      </div>
    </div>
  );
}
