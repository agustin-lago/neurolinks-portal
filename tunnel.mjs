import { spawn } from 'child_process';

console.log('Iniciando Cloudflare Tunnel...');

// 1. Iniciar cloudflared
const cloudflared = spawn('npx -y cloudflared tunnel --url http://localhost:3000', {
  shell: true,
});

let tunnelUrl = '';
let nextDevProcess = null;

// Escuchar los logs de cloudflared
cloudflared.stderr.on('data', (data) => {
  const output = data.toString();
  
  // Buscar el enlace de trycloudflare.com
  const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  
  if (match && !tunnelUrl) {
    tunnelUrl = match[0];
    const host = tunnelUrl.replace('https://', '');
    
    console.log('\n\n========================================================');
    console.log('✅ LINK LISTO (Comparte este enlace):');
    console.log(tunnelUrl);
    console.log('========================================================\n\n');
    
    // 2. Iniciar Next.js ahora que tenemos el host
    nextDevProcess = spawn('npx next dev', {
      shell: true,
      stdio: 'inherit',
      env: { 
        ...process.env, 
        TUNNEL_HOST: host,
        NEXT_PUBLIC_SITE_URL: tunnelUrl
      }
    });
  }
});

// Manejar cierre
process.on('SIGINT', () => {
  if (cloudflared) cloudflared.kill();
  if (nextDevProcess) nextDevProcess.kill();
  process.exit();
});
