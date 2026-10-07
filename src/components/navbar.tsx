"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Button, buttonVariants } from "./ui/button";
import { Moon, Sun, Globe, LogOut, User, ChevronDown } from "lucide-react";
import { usePathname, useRouter, Link } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useParams } from "next/navigation";
import { AccountSettingsModal } from "./account-settings-modal";

export function Navbar() {
  const t = useTranslations("Navbar");
  const { setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<{
    display_name: string;
    avatar_url: string;
    username: string;
  } | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Fetch detailed profile when user is available
  useEffect(() => {
    if (user?.id) {
      const fetchProfile = async () => {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .eq("id", user.id)
          .single();

        if (data) {
          const fallbackUsername = data.username || user.user_metadata?.username || user.email?.split("@")[0] || "";
          setUserProfile({
            display_name: data.display_name || user.user_metadata?.display_name || fallbackUsername,
            avatar_url: data.avatar_url || user.user_metadata?.avatar_url || `https://avatar.vercel.sh/${fallbackUsername}`,
            username: fallbackUsername,
          });
        }
      };

      fetchProfile();
    } else {
      setUserProfile(null);
    }
  }, [user?.id]);

  const switchLanguage = (newLocale: "ar" | "en") => {
    router.replace(pathname, { locale: newLocale });
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out:", err);
    } finally {
      setUser(null);
      setUserProfile(null);
      // Force complete redirect to localized login page
      window.location.href = `/${locale}/login`;
    }
  };

  const username = userProfile?.username || user?.user_metadata?.username || user?.email?.split("@")[0] || "user";
  const displayName = userProfile?.display_name || user?.user_metadata?.display_name || `@${username}`;

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container flex h-14 items-center px-4 md:px-8 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-6 me-4">
            <Link href="/" className="flex items-center space-x-2">
              <span className="font-bold text-lg sm:inline-block">ChatLan</span>
            </Link>
            {user && (
              <Link
                href="/chat"
                className="text-sm font-medium transition-colors hover:text-primary hidden sm:inline-block"
              >
                {t("chat")}
              </Link>
            )}
          </div>
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none"></div>
            <nav className="flex items-center space-x-2 gap-1">
              {/* Language Switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9 px-0 ms-2 cursor-pointer">
                  <Globe className="h-[1.2rem] w-[1.2rem]" />
                  <span className="sr-only">Toggle language</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => switchLanguage("ar")}>العربية</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => switchLanguage("en")}>English</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Theme Switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9 px-0 ms-2 cursor-pointer">
                  <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  <span className="sr-only">Toggle theme</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setTheme("light")}>{t("themeLight")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTheme("dark")}>{t("themeDark")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Dropdown Button */}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 hover:bg-muted border border-border text-xs font-medium transition-all focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring cursor-pointer ms-3">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={userProfile?.avatar_url || `https://avatar.vercel.sh/${username}`} />
                      <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-foreground max-w-32 truncate">{displayName}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ms-0.5" />
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-xl">
                    <div className="flex items-center gap-2.5 p-2 rounded-md bg-muted/40 mb-1 border border-border/50">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={userProfile?.avatar_url || `https://avatar.vercel.sh/${username}`} />
                        <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-bold text-foreground truncate">{displayName}</span>
                        <span className="text-[11px] text-muted-foreground truncate">@{username}</span>
                      </div>
                    </div>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={() => setIsSettingsModalOpen(true)}
                      className="cursor-pointer gap-2 py-2"
                    >
                      <User className="h-4 w-4 text-primary" />
                      <span className="font-medium text-xs">{t("accountSettings")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={handleLogout}
                      variant="destructive"
                      className="cursor-pointer gap-2 py-2 text-destructive focus:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4 text-destructive rtl:-scale-x-100" />
                      <span className="font-medium text-xs">{t("logout")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link href="/login" className={`${buttonVariants({ variant: "default" })} ms-4 font-semibold`}>
                  {t("login")}
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Account Settings Modal */}
      {user && (
        <AccountSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          user={user}
          onProfileUpdated={(updated) => {
            setUserProfile(updated);
          }}
        />
      )}
    </>
  );
}
