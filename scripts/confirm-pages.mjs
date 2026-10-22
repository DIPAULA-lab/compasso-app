import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appendFileSync} from 'node:fs';
const {CLOUDFLARE_API_TOKEN: token, DEPLOYMENT_ID: id, DEPLOYMENT_URL: url, EXPECTED_ENVIRONMENT: environment, GITHUB_SHA: sha} = process.env;
assert(token && id && url && sha, 'Faltam metadados ou credencial do deploy');
const endpoint = `https://api.cloudflare.com/client/v4/accounts/38eeed1e13c88c3177cbb6e8a63629a1/pages/projects/compasso-dipaula/deployments/${encodeURIComponent(id)}`;
let confirmed = false;
for (let attempt = 0; attempt < 12; attempt++) {
  const response = await fetch(endpoint, {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(15000)});
  assert(response.ok, `Consulta Cloudflare: HTTP ${response.status}`);
  const {result: deployment, success} = await response.json();
  assert(success && deployment, 'Deploy nao encontrado');
  assert.equal(deployment.environment, environment);
  assert.equal(deployment.deployment_trigger.metadata.commit_hash, sha);
  const status = deployment.latest_stage.status;
  assert(!['failure', 'canceled'].includes(status), `Deploy ${status}`);
  if (status === 'success') { confirmed = true; break; }
  await new Promise(resolve => setTimeout(resolve, 5000));
}
assert(confirmed, 'Deploy nao terminou no prazo');
for (const file of ['index.html', 'config.js', 'compasso-shim.js', 'compasso-motion.js']) {
  const expected = readFileSync(new URL('../public/' + file, import.meta.url));
  let matched = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(new URL(file + '?deploy=' + encodeURIComponent(id), url), {signal: AbortSignal.timeout(15000)});
    if (response.ok && expected.equals(Buffer.from(await response.arrayBuffer()))) { matched = true; break; }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  assert(matched, `Arquivo publicado diverge: ${file}`);
}
const summary = `Deploy confirmado: ${environment}\n\nCommit: ${sha}\n\nURL: ${url}\n\nID Cloudflare: ${id}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
