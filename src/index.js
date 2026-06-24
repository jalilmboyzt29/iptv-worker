import { connect } from 'cloudflare:sockets';

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "http://vzagut73megogo.xyz"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const host = url.host;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. PROXY PLAYLIST M3U8
    if (pathname.startsWith("/iptv/")) {
      const targetUrl = `http://vzagut73.megogo.xyz${pathname}${url.search}`;
      try {
        const res = await fetch(targetUrl, { method: "GET", headers: HEADERS });
        if (res.status !== 200) return new Response(`Error: ${res.statusText}`, { status: res.status, headers: corsHeaders });

        let content = await res.text();
        const contentModified = content.replace(
          /http:\/\/([^\/]+)\/iptv\/([^\?\s]+)\?md5=([^\s\r\n]+)/g,
          `https://${host}/proxy-ts/$1/iptv/$2?md5=$3`
        );
        return new Response(contentModified, { status: 200, headers: { ...corsHeaders, "Content-Type": "application/x-mpegURL" } });
      } catch (err) {
        return new Response(`Error: ${err.message}`, { status: 500, headers: corsHeaders });
      }
    }

    // 2. PROXY SEGMENT VIDEO TS (MENGGUNAKAN RAW TCP SOCKET UNTUK BYPASS TOTAL)
    if (pathname.startsWith("/proxy-ts/")) {
      const match = pathname.match(/^\/proxy-ts\/([^\/]+)\/iptv\/(.+)$/);
      if (!match) return new Response("Invalid format", { status: 400, headers: corsHeaders });

      const targetIp = match[1];
      const tsPath = match[2];
      const fullPathWithSearch = `/iptv/${tsPath}${url.search}`;

      try {
        // Membuka RAW TCP Connection langsung ke IP Target port 80
        const socket = connect({ hostname: targetIp, port: 80 });
        const writer = socket.writable.getWriter();

        // Menyusun Raw HTTP Request manual agar Cloudflare tidak bisa merusak Header Host IP mentah Anda
        const httpRequest = 
          `GET ${fullPathWithSearch} HTTP/1.1\r\n` +
          `Host: ${targetIp}\r\n` +
          `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n` +
          `Referer: http://vzagut73.megogo.xyz\r\n` +
          `Connection: close\r\n\r\n`;

        // Kirim request ke server Megogo
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(httpRequest));
        writer.releaseLock();

        // Membaca respons dari server Nginx Megogo
        const reader = socket.readable.getReader();
        let { value, done } = await reader.read();
        
        if (!value) {
          return new Response("Empty response from origin", { status: 502, headers: corsHeaders });
        }

        // Cari batas akhir HTTP Header (\r\n\r\n) untuk memisahkan Header Nginx dengan Biner Video (.ts)
        const view = new Uint8Array(value.buffer);
        let headerEndIndex = -1;
        for (let i = 0; i < view.length - 3; i++) {
          if (view[i] === 13 && view[i+1] === 10 && view[i+2] === 13 && view[i+3] === 10) {
            headerEndIndex = i + 4;
            break;
          }
        }

        if (headerEndIndex === -1) {
          return new Response("Invalid HTTP response pattern", { status: 502, headers: corsHeaders });
        }

        // Ambil potongan biner video pertama yang ikut terbaca di chunk awal
        const firstVideoChunk = view.slice(headerEndIndex);

        // Buat ReadableStream baru untuk meneruskan sisa data video langsung ke player secara streaming
        const stream = new ReadableStream({
          async start(controller) {
            if (firstVideoChunk.length > 0) {
              controller.enqueue(firstVideoChunk);
            }
            try {
              while (true) {
                const { value: nextValue, done: nextDone } = await reader.read();
                if (nextDone) break;
                controller.enqueue(nextValue);
              }
            } catch (e) {
              console.error("Stream reading error", e);
            } finally {
              controller.close();
            }
          }
        });

        return new Response(stream, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "video/mp2t",
            "Cache-Control": "no-cache, no-store, must-revalidate"
          }
        });

      } catch (err) {
        return new Response(`Socket Proxy Error: ${err.message}`, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
