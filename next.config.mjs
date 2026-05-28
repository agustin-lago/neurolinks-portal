/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Aplica a todas las rutas
        source: "/(.*)",
        headers: [
          {
            // Permite embeber iframes de Railway.app (chatbots de asistentes)
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "media-src 'self'",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              // Permite los chatbots de Railway.app en iframes
              "frame-src 'self' https://*.railway.app",
              // Permite microfono/cámara en los iframes de chatbots
              "child-src 'self' https://*.railway.app",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
