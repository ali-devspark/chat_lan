import { NextResponse } from "next/server";

export async function GET() {
  const customTurnUrl = process.env.TURN_URL || process.env.NEXT_PUBLIC_TURN_URL;
  const customTurnUser = process.env.TURN_USERNAME || process.env.NEXT_PUBLIC_TURN_USERNAME;
  const customTurnCred = process.env.TURN_CREDENTIAL || process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  const meteredApiKey = process.env.METERED_API_KEY || process.env.NEXT_PUBLIC_METERED_API_KEY;
  const meteredDomain = process.env.METERED_DOMAIN || process.env.NEXT_PUBLIC_METERED_DOMAIN;

  let iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.services.mozilla.com" },
  ];

  // 1. If Metered API key is configured, fetch live dynamic TURN credentials
  if (meteredApiKey) {
    try {
      const domainSlug = meteredDomain
        ? meteredDomain.replace(/\.metered\.ca$/, "").trim()
        : "";
      const endpoint = domainSlug
        ? `https://${domainSlug}.metered.ca/api/v1/turn/credentials?apiKey=${meteredApiKey}`
        : `https://metered.ca/api/v1/turn/credentials?apiKey=${meteredApiKey}`;

      const res = await fetch(endpoint, {
        next: { revalidate: 3600 },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          iceServers = [...data, ...iceServers];
        }
      } else {
        console.warn(`[ICE API] Metered API responded with status ${res.status}`);
      }
    } catch (err) {
      console.warn("[ICE API] Error fetching Metered dynamic TURN servers:", err);
    }
  }

  // 2. If static custom TURN server is provided in env
  if (customTurnUrl) {
    const urls = customTurnUrl.split(",").map((u) => u.trim());
    iceServers.unshift({
      urls,
      username: customTurnUser || "",
      credential: customTurnCred || "",
    });
  }

  const hasTurn = iceServers.some((s) => {
    if (typeof s.urls === "string") {
      return s.urls.startsWith("turn:") || s.urls.startsWith("turns:");
    }
    if (Array.isArray(s.urls)) {
      return s.urls.some((u) => u.startsWith("turn:") || u.startsWith("turns:"));
    }
    return false;
  });

  return NextResponse.json({
    iceServers,
    iceCandidatePoolSize: 10,
    hasTurn,
  });
}
