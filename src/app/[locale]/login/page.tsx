"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";

export default function LoginPage() {
  const t = useTranslations("Auth");
  const supabase = createClient();
  const params = useParams();
  const locale = (params?.locale as string) || "ar";

  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const translateError = (msg: string) => {
    if (!msg) return t("errorAuth");
    if (msg.includes("Invalid login credentials")) return "بيانات الدخول غير صحيحة (البريد الإلكتروني أو كلمة المرور).";
    if (msg.includes("User already registered")) return "هذا البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول.";
    if (msg.includes("Password should be at least")) return "كلمة المرور يجب أن تتكون من 6 أحرف على الأقل.";
    if (msg.includes("Email rate limit exceeded")) return "تم تجاوز الحد المسموح للمحاولات، يرجى الانتظار قليلاً.";
    if (msg.includes("Email not confirmed")) return "يرجى تأكيد بريدك الإلكتروني من خلال الرابط المرسل إليك.";
    return `${t("errorAuth")}: ${msg}`;
  };

  const handleAuth = async (type: "login" | "register") => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl.includes("your-project-id") || supabaseUrl.includes("placeholder")) {
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
        email,
        password,
      });
      error = signInError;
    } else {
      const cleanUsername = username.trim() || email.split("@")[0];
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: cleanUsername,
          },
        },
      });
      error = signUpError;
    }

    if (error) {
      setErrorMessage(translateError(error.message));
      setIsLoading(false);
    } else {
      setSuccessMessage(type === "login" ? "تم تسجيل الدخول بنجاح! جاري التوجيه..." : "تم إنشاء الحساب بنجاح! جاري التوجيه...");
      setTimeout(() => {
        window.location.href = `/${locale}/chat`;
      }, 800);
    }
  };

  const isConfigured =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project-id") &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

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

      <Tabs defaultValue="login" className="max-w-md w-full" onValueChange={() => { setErrorMessage(null); setSuccessMessage(null); }}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="login">{t("login")}</TabsTrigger>
          <TabsTrigger value="register">{t("register")}</TabsTrigger>
        </TabsList>

        {/* Error Alert Box */}
        {errorMessage && (
          <div className="mb-4 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive flex items-start gap-3 animate-in fade-in duration-200 shadow-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm font-medium leading-relaxed">{errorMessage}</div>
          </div>
        )}

        {/* Success Alert Box */}
        {successMessage && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-start gap-3 animate-in fade-in duration-200 shadow-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm font-medium leading-relaxed">{successMessage}</div>
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
                  onChange={(e) => { setEmail(e.target.value); setErrorMessage(null); }}
                  placeholder="m@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password-login">{t("password")}</Label>
                <Input
                  id="password-login"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMessage(null); }}
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
                disabled={isLoading}
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
                <Label htmlFor="username-register">{t("username")}</Label>
                <Input
                  id="username-register"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setErrorMessage(null); }}
                  placeholder="user123"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-register">{t("email")}</Label>
                <Input
                  id="email-register"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMessage(null); }}
                  placeholder="m@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password-register">{t("password")}</Label>
                <Input
                  id="password-register"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMessage(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAuth("register");
                  }}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full font-semibold py-5 rounded-xl shadow-md"
                onClick={() => handleAuth("register")}
                disabled={isLoading}
              >
                {isLoading ? "جاري إنشاء الحساب..." : t("submitRegister")}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
