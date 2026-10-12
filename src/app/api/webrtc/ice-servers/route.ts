import { NextResponse } from "next/server";

export async function GET() {
  const customTurnUrl = process.env.TURN_URL || process.env.NEXT_PUBLIC_TURN_URL;
  const customTurnUser = process.env.TURN_USERNAME || process.env.NEXT_PUBLIC_TURN_USERNAME;
  const customTurnCred = process.env.TURN_CREDENTIAL || process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  const meteredApiKey =
    process.env.METERED_SECRET_KEY ||
    process.env.METERED_API_KEY ||
    process.env.NEXT_PUBLIC_METERED_API_KEY;
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

  // 1. Fetch live dynamic TURN credentials from Metered
  if (meteredApiKey) {
    const rawDomain = meteredDomain || "chatlan";
    const domainSlug = rawDomain
      .replace(/^https?:\/\//, "")
      .replace(/\.metered\.(live|ca).*$/, "")
      .replace(/\/.*$/, "")
      .trim();

    const host = `${domainSlug}.metered.live`;
    const key = meteredApiKey.trim();

    try {
      // First try: secretKey POST endpoint (official Metered server-side credential generation)
      const secretRes = await fetch(`https://${host}/api/v1/turn/credential?secretKey=${key}`, {
        method: "POST",
        next: { revalidate: 3600 },
      });

      if (secretRes.ok) {
        const secretData = await secretRes.json();
        if (secretData.username && secretData.password) {
          // If secretData returned an apiKey, fetch the complete ICE server list
          let gotServerList = false;
          if (secretData.apiKey) {
            try {
              const serversRes = await fetch(
                `https://${host}/api/v1/turn/credentials?apiKey=${secretData.apiKey}`,
                { next: { revalidate: 3600 } }
              );
              if (serversRes.ok) {
                const sData = await serversRes.json();
                if (Array.isArray(sData) && sData.length > 0) {
                  iceServers = [...sData, ...iceServers];
                  gotServerList = true;
                }
              }
            } catch (e) {
              console.warn("[ICE API] Secondary credentials list fetch failed:", e);
            }
          }

          if (!gotServerList) {
            iceServers.unshift(
              { urls: "stun:stun.relay.metered.ca:80" },
              {
                urls: "turn:global.relay.metered.ca:80",
                username: secretData.username,
                credential: secretData.password,
              },
              {
                urls: "turn:global.relay.metered.ca:80?transport=tcp",
                username: secretData.username,
                credential: secretData.password,
              },
              {
                urls: "turn:global.relay.metered.ca:443",
                username: secretData.username,
                credential: secretData.password,
              },
              {
                urls: "turns:global.relay.metered.ca:443?transport=tcp",
                username: secretData.username,
                credential: secretData.password,
              }
            );
          }
        }
      } else {
        // Second try: standard apiKey GET endpoint
        const apiRes = await fetch(`https://${host}/api/v1/turn/credentials?apiKey=${key}`, {
          next: { revalidate: 3600 },
        });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (Array.isArray(apiData) && apiData.length > 0) {
            iceServers = [...apiData, ...iceServers];
          }
        } else {
          console.warn(`[ICE API] Metered API responded with status ${apiRes.status}`);
        }
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
