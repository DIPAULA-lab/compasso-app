/* Configuração do Compasso (reserva).
   Quando o app roda pelo servidor local (server/compasso.py), o próprio servidor
   gera o /config.js a partir do banco, e você ajusta tudo em Ajustes → Conexões e dados.
   Este arquivo só vale se a pasta public/ for servida por outro programa
   (ex.: python3 -m http.server 8080 -d public): aí os dados ficam no navegador. */
window.COMPASSO_CONFIG = {
  backend: 'local',          // 'server' (servidor local) · 'local' (localStorage) · 'supabase'
  supabaseUrl: '',
  supabaseAnonKey: '',
  googleClientId: '',
  googleCalendars: ['primary'],
  stravaEndpoint: '/api/strava',
};
