import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/ar/chat";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.user) {
      const user = data.user;
      // Auto-create/upsert user record in public.profiles table
      try {
        const rawUsername =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "user";
        const cleanUsername = rawUsername.replace(/\s+/g, "_").toLowerCase();

        await supabase.from("profiles").upsert(
          {
            id: user.id,
            username: cleanUsername,
            display_name:
              user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              cleanUsername,
            avatar_url:
              user.user_metadata?.avatar_url ||
              user.user_metadata?.picture ||
              `https://avatar.vercel.sh/${user.id}`,
          },
          { onConflict: "id" }
        );
      } catch (err) {
        console.warn("Auto profile create during OAuth callback notice:", err);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Redirect to login on error
  return NextResponse.redirect(`${origin}/ar/login?error=oauth_error`);
}
