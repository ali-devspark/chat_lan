"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, User, Settings, Loader2, Check, Shield, Mail, AtSign, Image as ImageIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { createClient } from "@/lib/supabase/client";

export interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onProfileUpdated?: (updatedProfile: { display_name: string; avatar_url: string; username: string }) => void;
}

export function AccountSettingsModal({
  isOpen,
  onClose,
  user,
  onProfileUpdated,
}: AccountSettingsModalProps) {
  const t = useTranslations("Account");
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState("profile");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      setFeedback(null);
      setEmail(user.email || "");
      
      const fetchUserProfile = async () => {
        setIsFetching(true);
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

          const fallbackUsername = user.user_metadata?.username || user.email?.split("@")[0] || "";
          const fallbackDisplayName = user.user_metadata?.display_name || fallbackUsername;

          if (data && !error) {
            setDisplayName(data.display_name || fallbackDisplayName);
            setUsername(data.username || fallbackUsername);
            setAvatarUrl(data.avatar_url || user.user_metadata?.avatar_url || `https://avatar.vercel.sh/${data.username || user.id}`);
          } else {
            setDisplayName(fallbackDisplayName);
            setUsername(fallbackUsername);
            setAvatarUrl(user.user_metadata?.avatar_url || `https://avatar.vercel.sh/${fallbackUsername}`);
          }
        } catch (err) {
          console.error("Error fetching profile for settings:", err);
        } finally {
          setIsFetching(false);
        }
      };

      fetchUserProfile();
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setFeedback(null);
    const cleanDisplayName = displayName.trim();
    if (!cleanDisplayName) {
      setFeedback({ type: "error", text: t("displayNameLabel") });
      return;
    }

    setIsLoading(true);

    try {
      const finalAvatar = avatarUrl.trim() || `https://avatar.vercel.sh/${username || user.id}`;

      // 1. Update Auth Metadata first
      const { data: authData, error: authError } = await supabase.auth.updateUser({
        data: {
          display_name: cleanDisplayName,
          avatar_url: finalAvatar,
        },
      });

      if (authError) {
        console.warn("Auth metadata update notice:", authError.message);
      }

      // 2. Try updating public.profiles table
      try {
        const { error: profileError } = await supabase
          .from("profiles")
          .upsert({
            id: user.id,
            username: username || user.user_metadata?.username || user.email?.split("@")[0],
            display_name: cleanDisplayName,
            avatar_url: finalAvatar,
            updated_at: new Date().toISOString(),
          });

        if (profileError) {
          console.warn("Profiles DB update notice:", profileError.message);
          if (profileError.message.includes("display_name")) {
            await supabase.from("profiles").upsert({
              id: user.id,
              username: username || user.user_metadata?.username || user.email?.split("@")[0],
              avatar_url: finalAvatar,
              updated_at: new Date().toISOString(),
            });
          }
        }
      } catch (dbErr) {
        console.warn("Could not update profiles table directly:", dbErr);
      }

      setFeedback({ type: "success", text: t("saveProfileSuccess") });
      
      if (onProfileUpdated) {
        onProfileUpdated({
          display_name: cleanDisplayName,
          avatar_url: finalAvatar,
          username,
        });
      }

      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error("Failed to save profile:", err);
      setFeedback({ type: "error", text: `${err.message || "Error"}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div
        className="bg-background border rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative space-y-0 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-5 border-b flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-snug">{t("settingsTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("settingsSub")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground rounded-full p-1.5 hover:bg-accent transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">{t("close")}</span>
          </button>
        </div>

        {/* Modal Content / Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 pt-3 border-b bg-muted/10">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="profile" className="gap-2 text-xs font-semibold">
                <User className="h-4 w-4" />
                <span>{t("profileTab")}</span>
              </TabsTrigger>
              <TabsTrigger value="account" className="gap-2 text-xs font-semibold">
                <Shield className="h-4 w-4" />
                <span>{t("accountTab")}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-5 flex-1 overflow-y-auto">
            {isFetching ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {feedback && (
                  <div
                    className={`mb-4 p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2.5 animate-in fade-in duration-200 ${
                      feedback.type === "success"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-destructive/10 border-destructive/30 text-destructive"
                    }`}
                  >
                    {feedback.type === "success" ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
                    <span>{feedback.text}</span>
                  </div>
                )}

                {/* TAB 1: Profile Information */}
                <TabsContent value="profile" className="mt-0 space-y-5">
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    {/* Avatar Display & Edit */}
                    <div className="flex items-center gap-4 p-3.5 rounded-xl bg-muted/40 border">
                      <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-sm shrink-0">
                        <AvatarImage src={avatarUrl} />
                        <AvatarFallback className="text-lg font-bold">
                          {(displayName || username || "U")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm truncate">{displayName || `@${username}`}</h4>
                        <p className="text-xs text-muted-foreground truncate">@{username}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{t("avatarNote")}</p>
                      </div>
                    </div>

                    {/* Display Name Input */}
                    <div className="space-y-1.5">
                      <Label htmlFor="display-name" className="text-xs font-semibold flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-primary" />
                        <span>{t("displayNameLabel")}</span>
                      </Label>
                      <Input
                        id="display-name"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={t("displayNamePlaceholder")}
                        className="rounded-xl text-sm"
                        required
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t("displayNameDesc")}
                      </p>
                    </div>

                    {/* Avatar URL Input */}
                    <div className="space-y-1.5">
                      <Label htmlFor="avatar-url" className="text-xs font-semibold flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{t("avatarUrlLabel")}</span>
                      </Label>
                      <Input
                        id="avatar-url"
                        type="url"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder="https://example.com/my-photo.jpg"
                        className="rounded-xl text-sm dir-ltr"
                      />
                    </div>

                    {/* Save Button */}
                    <div className="pt-3 border-t flex justify-end gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isLoading}
                        className="rounded-xl text-xs"
                      >
                        {t("cancel")}
                      </Button>
                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="rounded-xl text-xs font-semibold gap-1.5 min-w-28 justify-center shadow-xs"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>{t("saving")}</span>
                          </>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>{t("saveChanges")}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                {/* TAB 2: Account Security / Meta */}
                <TabsContent value="account" className="mt-0 space-y-4">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{t("usernameLabel")}</span>
                      </Label>
                      <Input
                        type="text"
                        value={`@${username}`}
                        disabled
                        className="rounded-xl text-sm bg-muted/50 cursor-not-allowed"
                      />
                      <p className="text-[11px] text-muted-foreground">{t("usernameDesc")}</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{t("emailLabel")}</span>
                      </Label>
                      <Input
                        type="email"
                        value={email}
                        disabled
                        className="rounded-xl text-sm bg-muted/50 cursor-not-allowed dir-ltr"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t flex justify-end">
                    <Button variant="outline" onClick={onClose} className="rounded-xl text-xs">
                      {t("close")}
                    </Button>
                  </div>
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
