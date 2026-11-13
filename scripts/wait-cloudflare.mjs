// Espera a API do Cloudflare Pages responder antes de publicar.
// Só lê o projeto (GET); não publica nem altera nada. Repete enquanto houver 5xx ou erro de rede,
// com espera crescente (até ~5 min). Erros 4xx (credencial, projeto) falham na hora: repetir não resolve.
const {CLOUDFLARE_API_TOKEN: token, CF_ACCOUNT: account, CF_PROJECT: project} = process.env;
if (!token || !account || !project) { console.error('Faltam CLOUDFLARE_API_TOKEN, CF_ACCOUNT ou CF_PROJECT.'); process.exit(1); }
const url = `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}`;
const waits = [0, 10, 20, 30, 45, 60, 60, 60];
for (const [i, s] of waits.entries()) {
  if (s) { console.log(`Tentando de novo em ${s}s…`); await new Promise(r => setTimeout(r, s * 1000)); }
  let status = 0;
  try { status = (await fetch(url, {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(20000)})).status; }
  catch (e) { console.log(`Tentativa ${i + 1}: sem resposta (${e.name}).`); continue; }
  if (status >= 200 && status < 300) { console.log(`API do Cloudflare disponível (tentativa ${i + 1}).`); process.exit(0); }
  if (status < 500) { console.error(`A API respondeu ${status}: confira o token CLOUDFLARE_API_TOKEN e o projeto ${project}.`); process.exit(1); }
  console.log(`Tentativa ${i + 1}: Cloudflare respondeu ${status} (instabilidade do lado deles).`);
}
console.error('A API do Cloudflare continua indisponível. Veja https://www.cloudflarestatus.com e rode o job de novo mais tarde.');
process.exit(1);
