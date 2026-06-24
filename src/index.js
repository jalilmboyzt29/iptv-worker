const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "http://vzagut73.megogo.xyz"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname; // Otomatis berisi "/iptv/5WS4WSUFCCHGQF/6124/index.m3u8"
    const host = url.host;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. PROXY PLAYLIST M3U8 (Membaca jalur /iptv/ secara utuh)
    if (pathname.startsWith("/iptv/")) {

      // LANGSUNG DIABGUNGKAN: http://megogo.xyz + /iptv/5WS4WSUFCCHGQF/6124/index.m3u8
      const targetUrl = `http://vzagut73.megogo.xyz${pathname}${url.search}`;

      try {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers: HEADERS,
          redirect: "follow"
        });

        if (res.status !== 200) {
          return new Response(`Megogo Error: ${res.statusText}`, { status: res.status, headers: corsHeaders });
        }

        let content = await res.text();

        // Mengubah semua link streaming IP asli menjadi link proxy-ts Worker Anda
        const contentModified = content.replace(
          /http:\/\/([^\/]+)\/iptv\/([^\?\s]+)\?md5=([^\s\r\n]+)/g,
          `https://${host}/proxy-ts/$1/iptv/$2?md5=$3`
        );

        return new Response(contentModified, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/x-mpegURL"
          }
        });
      } catch (err) {
        return new Response(`Worker Fetch Error: ${err.message}`, { status: 500, headers: corsHeaders });
      }
    }

    // 2. PROXY SEGMENT VIDEO TS
    if (pathname.startsWith("/proxy-ts/")) {
      const match = pathname.match(/^\/proxy-ts\/([^\/]+)\/iptv\/(.+)$/);

       if (!match) {
        return new Response("Invalid proxy-ts path format", { status: 400, headers: corsHeaders });
      }

      const targetIp = match[1];
      const tsPath = match[2];
      const tsUrl = `http://${targetIp}/iptv/${tsPath}${url.search}`;

      try {
        const res = await fetch(tsUrl, {
          method: "GET",
          headers: {
            "Host": targetIp, // Mengirimkan IP mentah sebagai Host seperti suksesnya curl Anda
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive"
          },
          redirect: "follow"
        });

        return new Response(res.body, {
          status: res.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "video/mp2t",
            "Cache-Control": "no-cache, no-store, must-revalidate"
          }
        });
      } catch (err) {
        return new Response(`TS Fetch Error: ${err.message}`, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
