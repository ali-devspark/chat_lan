"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { AlertCircle, CheckCircle2, ShieldAlert, Loader2 } from "lucide-react";

export default function LoginPage() {
  const t = useTranslations("Auth");
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "ar";
  const nextParam = searchParams.get("next");

  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameFeedback, setUsernameFeedback] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // If user is already authenticated, immediately hide login/register and redirect
  useEffect(() => {
    async function checkExistingAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const destination = nextParam ? decodeURIComponent(nextParam) : "/chat";
          if (destination.startsWith(`/${locale}`)) {
            window.location.href = destination;
          } else {
            router.replace(destination);
          }
          return;
        }
      } catch (err) {
        console.warn("Auth check note:", err);
      } finally {
        setIsCheckingSession(false);
      }
    }

    checkExistingAuth();
  }, [supabase, router, nextParam, locale]);

  // Real-time username format validation and uniqueness check
  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameStatus("idle");
      setUsernameFeedback("");
      return;
    }

    // 1. Check for spaces
    if (/\s/.test(trimmed)) {
      setUsernameStatus("invalid");
      setUsernameFeedback(t("usernameInvalidChars"));
      return;
    }

    // 2. Check length (min 3, max 30)
    if (trimmed.length < 3) {
      setUsernameStatus("invalid");
      setUsernameFeedback(t("usernameTooShort"));
      return;
    }

    if (trimmed.length > 30) {
      setUsernameStatus("invalid");
      setUsernameFeedback(t("usernameTooLong"));
      return;
    }

    // 3. Check English letters, numbers, and _ or - only
    const validFormatRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validFormatRegex.test(trimmed)) {
      setUsernameStatus("invalid");
      setUsernameFeedback(t("usernameInvalidChars"));
      return;
    }

    // 4. Debounced Supabase uniqueness check
    setUsernameStatus("checking");
    setUsernameFeedback(t("usernameChecking"));

    const checkTimer = setTimeout(async () => {
      try {
        const clean = trimmed.toLowerCase();
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", clean)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.warn("Username check notice:", error);
        }

        if (data) {
          setUsernameStatus("taken");
          setUsernameFeedback(t("usernameTaken"));
        } else {
          setUsernameStatus("available");
          setUsernameFeedback(t("usernameAvailable"));
        }
      } catch (err) {
        console.warn("Username uniqueness check caught:", err);
      }
    }, 350);

    return () => clearTimeout(checkTimer);
  }, [username, supabase, t]);

  const translateError = (msg: string) => {
    if (!msg) return t("errorAuth");
    if (msg.includes("Invalid login credentials"))
      return "بيانات الدخول غير صحيحة (البريد الإلكتروني أو كلمة المرور).";
    if (msg.includes("User already registered"))
      return "هذا البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول.";
    if (msg.includes("Password should be at least"))
      return "كلمة المرور يجب أن تتكون من 6 أحرف على الأقل.";
    if (msg.includes("Email rate limit exceeded"))
      return "تم تجاوز الحد المسموح للمحاولات، يرجى الانتظار قليلاً.";
    if (msg.includes("Email not confirmed"))
      return "يرجى تأكيد بريدك الإلكتروني من خلال الرابط المرسل إليك.";
    if (msg.includes("profiles_username_key") || msg.includes("duplicate key"))
      return t("usernameTaken");
    return `${t("errorAuth")}: ${msg}`;
  };

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsGoogleLoading(true);

    try {
      const redirectTarget = nextParam ? decodeURIComponent(nextParam) : `/${locale}/chat`;
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTarget)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        setErrorMessage(translateError(error.message));
        setIsGoogleLoading(false);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "حدث خطأ أثناء الاتصال بـ Google";
      setErrorMessage(msg);
      setIsGoogleLoading(false);
    }
  };

  const handleAuth = async (type: "login" | "register") => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (
      !supabaseUrl ||
      supabaseUrl.includes("your-project-id") ||
      supabaseUrl.includes("placeholder")
    ) {
      setErrorMessage(
        "لم يتم ربط تطبيقك بـ Supabase بعد! يرجى إدخال مفاتيح Supabase الحقيقية في ملف .env."
      );
      return;
    }

    if (!email.trim() || !password.trim()) {
      setErrorMessage("يرجى إدخال البريد الإلكتروني وكلمة المرور بشكل كامل.");
      return;
    }

    setIsLoading(true);
    let error = null;

    if (type === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      error = signInError;
    } else {
      const cleanUsername = username.trim().toLowerCase();
      
      // Strict client-side validation
      if (!cleanUsername) {
        setErrorMessage(t("usernameRequired"));
        setIsLoading(false);
        return;
      }

      if (/\s/.test(cleanUsername) || !/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
        setErrorMessage(t("usernameInvalidChars"));
        setIsLoading(false);
        return;
      }

      if (cleanUsername.length < 3) {
        setErrorMessage(t("usernameTooShort"));
        setIsLoading(false);
        return;
      }

      if (cleanUsername.length > 30) {
        setErrorMessage(t("usernameTooLong"));
        setIsLoading(false);
        return;
      }

      if (usernameStatus === "taken") {
        setErrorMessage(t("usernameTaken"));
        setIsLoading(false);
        return;
      }

      // Final live check against Supabase
      try {
        const { data: existingUser } = await supabase
          .from("profiles")
          .select("id")
          .ilike("username", cleanUsername)
          .maybeSingle();

        if (existingUser) {
          setUsernameStatus("taken");
          setUsernameFeedback(t("usernameTaken"));
          setErrorMessage(t("usernameTaken"));
          setIsLoading(false);
          return;
        }
      } catch (checkErr) {
        console.warn("Pre-register check notice:", checkErr);
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: cleanUsername,
            display_name: cleanUsername,
          },
        },
      });
      error = signUpError;
    }

    if (error) {
      setErrorMessage(translateError(error.message));
      setIsLoading(false);
    } else {
      setSuccessMessage(
        type === "login"
          ? "تم تسجيل الدخول بنجاح! جاري التوجيه..."
          : "تم إنشاء الحساب بنجاح! جاري التوجيه..."
      );
      const targetDestination = nextParam ? decodeURIComponent(nextParam) : `/${locale}/chat`;
      setTimeout(() => {
        window.location.href = targetDestination;
      }, 700);
    }
  };

  const isConfigured =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project-id") &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  // Show clean spinner while checking if already logged in to prevent flickering
  if (isCheckingSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            {t("checkingSession")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4 min-h-[calc(100vh-4rem)]">
      {!isConfigured && (
        <div className="max-w-md w-full p-4 text-sm rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-start gap-3 shadow-xs">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <strong>تنبيه ربط قاعدة البيانات:</strong> يرجى وضع رابط ومفتاح مشروع Supabase الخاص بك في ملف <code>.env</code> ليعمل تسجيل الدخول بشكل كامل.
          </div>
        </div>
      )}

      <div className="max-w-md w-full">
        {/* Google OAuth Sign-in Option */}
        <div className="mb-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleLogin}
            disabled={isLoading || isGoogleLoading}
            className="w-full py-5 rounded-2xl border border-border shadow-xs hover:bg-accent/70 transition-all font-medium flex items-center justify-center gap-3 cursor-pointer"
          >
            {isGoogleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span className="text-sm font-semibold">{t("googleSignIn")}</span>
          </Button>

          {/* Divider */}
          <div className="relative my-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <span className="relative bg-background px-3 text-xs uppercase text-muted-foreground font-semibold">
              {t("orDivider")}
            </span>
          </div>
        </div>

        <Tabs
          defaultValue="login"
          className="w-full"
          onValueChange={() => {
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="login">{t("login")}</TabsTrigger>
            <TabsTrigger value="register">{t("register")}</TabsTrigger>
          </TabsList>

          {/* Error Alert Box */}
          {errorMessage && (
            <div className="mb-4 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive flex items-start gap-3 animate-in fade-in duration-200 shadow-xs">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm font-medium leading-relaxed">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Success Alert Box */}
          {successMessage && (
            <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-start gap-3 animate-in fade-in duration-200 shadow-xs">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm font-medium leading-relaxed">
                {successMessage}
              </div>
            </div>
          )}

          <TabsContent value="login">
            <Card className="border shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl">{t("login")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email-login">{t("email")}</Label>
                  <Input
                    id="email-login"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="m@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-login">{t("password")}</Label>
                  <Input
                    id="password-login"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMessage(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAuth("login");
                    }}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full font-semibold py-5 rounded-xl shadow-md"
                  onClick={() => handleAuth("login")}
                  disabled={isLoading || isGoogleLoading}
                >
                  {isLoading ? "جاري تسجيل الدخول..." : t("submitLogin")}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card className="border shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl">{t("register")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="username-register">{t("username")}</Label>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      (a-z, 0-9, _, -)
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      id="username-register"
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setErrorMessage(null);
                      }}
                      placeholder="user_123"
                      className={`pe-10 font-mono text-sm ${
                        usernameStatus === "available"
                          ? "border-emerald-500/60 focus-visible:ring-emerald-500/30"
                          : usernameStatus === "taken" || usernameStatus === "invalid"
                          ? "border-destructive/60 focus-visible:ring-destructive/30"
                          : ""
                      }`}
                      dir="ltr"
                    />
                    <div className="absolute inset-y-0 inset-e-3 flex items-center pointer-events-none">
                      {usernameStatus === "checking" && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {usernameStatus === "available" && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 animate-in zoom-in-75 duration-150" />
                      )}
                      {(usernameStatus === "taken" || usernameStatus === "invalid") && (
                        <AlertCircle className="h-4 w-4 text-destructive animate-in zoom-in-75 duration-150" />
                      )}
                    </div>
                  </div>
                  {/* Status Helper Message */}
                  {usernameFeedback ? (
                    <p
                      className={`text-xs flex items-center gap-1.5 transition-all animate-in fade-in duration-150 ${
                        usernameStatus === "available"
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : usernameStatus === "checking"
                          ? "text-muted-foreground"
                          : "text-destructive font-medium"
                      }`}
                    >
                      <span>{usernameFeedback}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {t("usernameFormatHint")}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-register">{t("email")}</Label>
                  <Input
                    id="email-register"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMessage(null);
                    }}
                    placeholder="m@example.com"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-register">{t("password")}</Label>
                  <Input
                    id="password-register"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMessage(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAuth("register");
                    }}
                    dir="ltr"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full font-semibold py-5 rounded-xl shadow-md cursor-pointer"
                  onClick={() => handleAuth("register")}
                  disabled={
                    isLoading ||
                    isGoogleLoading ||
                    usernameStatus === "checking" ||
                    usernameStatus === "taken" ||
                    usernameStatus === "invalid"
                  }
                >
                  {isLoading ? "جاري إنشاء الحساب..." : t("submitRegister")}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
