const MEGOGO_IP = "103.163.132.53";
const ORIGINAL_HOST = "vzagut73.megogo.xyz";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": `http://${ORIGINAL_HOST}/`,
  "Host": ORIGINAL_HOST
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const host = url.host; // Mengambil domain Worker Anda otomatis

    // CORS Headers untuk mengizinkan semua pemutar video (IPTV Player/VLC)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    // Tangani request OPTIONS (Preflight CORS) otomatis
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. PROXY PLAYLIST M3U8 (/proxy-iptv/...)
    if (pathname.startsWith("/proxy-iptv/")) {
      const subpath = pathname.replace("/proxy-iptv/", "");
      const targetUrl = `http://vzagut73.megogo.xyz${subpath}${url.search}`;

      try {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers: HEADERS,
          redirect: "follow"
        });

        if (res.status !== 200) {
          return new Response(res.statusText, { status: res.status, headers: corsHeaders });
        }

        let content = await res.text();

        // Regex untuk mengubah link http://IP/iptv/... menjadi https://domain-worker/proxy-ts/IP/iptv/...
        // Menggunakan global flag (g) untuk mengubah semua baris di dalam file m3u8
        const contentModified = content.replace(
          /http:\/\/([^\/]+)\/iptv\//g,
          `https://${host}/proxy-ts/$1/iptv/`
        );

        return new Response(contentModified, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/x-mpegURL"
          }
        });
      } catch (err) {
        return new Response(`Error fetching playlist: ${err.message}`, { status: 500, headers: corsHeaders });
      }
    }

    // 2. PROXY SEGMENT VIDEO TS (/proxy-ts/...)
    if (pathname.startsWith("/proxy-ts/")) {
      // Regex untuk memisahkan Target IP dan sisa path .ts
      const match = pathname.match(/^\/proxy-ts\/([^\/]+)\/iptv\/(.+)$/);
      
      if (!match) {
        return new Response("Invalid proxy-ts path format", { status: 400, headers: corsHeaders });
      }

      const targetIp = match[1];
      const tsPath = match[2];
      const tsUrl = `http://${targetIp}/iptv/${tsPath}${url.search}`;

      try {
        const res = await fetch(tsUrl, { headers: HEADERS });

        // Cloudflare secara otomatis mengalirkan (stream) response body 
        // tanpa memakan RAM server, mirip dengan res.iter_content di Flask.
        return new Response(res.body, {
          status: res.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "video/mp2t",
            "Cache-Control": "public, max-age=3600" // Opsional: Cache segmen .ts selama 1 jam agar hemat bandwidth
          }
        });
      } catch (err) {
        return new Response(`Error fetching TS segment: ${err.message}`, { status: 500, headers: corsHeaders });
      }
    }

    // Route tidak ditemukan
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
