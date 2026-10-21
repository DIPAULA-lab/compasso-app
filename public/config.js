/* Configuração pública da versão na nuvem.
   O servidor Python gera outra configuração para a instalação local.
   Esta chave é publicável; o acesso aos dados é protegido por sessão e RLS. */
window.COMPASSO_CONFIG = {
  backend: 'supabase',
  supabaseUrl: 'https://givneltvddpmlnakatgp.supabase.co',
  supabasePublishableKey: "sb_publishable_b2X3ZDWAwoIX7sKBA-vQ8A_UIVWWonA",
  authAllowSignup: false,
  googleClientId: '',
  googleCalendars: ['primary'],
  cloudEndpoint: 'https://givneltvddpmlnakatgp.supabase.co/functions/v1/compasso-cloud',
  installationEndpoint: 'https://givneltvddpmlnakatgp.supabase.co/functions/v1/compasso-installation',
  stravaEndpoint: 'https://givneltvddpmlnakatgp.supabase.co/functions/v1/compasso-cloud/strava',
  googleEnabled: false,
};
