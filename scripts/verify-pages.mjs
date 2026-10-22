import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import vm from 'node:vm';
const root = new URL('../public/', import.meta.url);
const config = {};
vm.runInNewContext(readFileSync(new URL('config.js', root), 'utf8'), {window: config});
assert.equal(config.COMPASSO_CONFIG.backend, 'supabase');
assert.equal(new URL(config.COMPASSO_CONFIG.supabaseUrl).protocol, 'https:');
const html = readFileSync(new URL('index.html', root), 'utf8');
const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => tag.slice(0, tag.indexOf('>') + 1));
for (const match of markup.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
  const path = match[1];
  if (/^(?:https?:|data:|\/\/)/.test(path)) continue;
  assert(!path.includes('..'), `Caminho externo ao pacote: ${path}`);
  readFileSync(new URL(path.replace(/^\//, ''), root));
}
JSON.parse(readFileSync(new URL('manifest.webmanifest', root), 'utf8'));
function inspect(dir) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    assert(!/(?:^\.env|\.db$|\.sqlite|\.pem$|\.key$|backup.*\.json$)/i.test(entry.name), `Arquivo privado: ${entry.name}`);
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) inspect(path);
    else if (/\.(?:js|html|json|webmanifest)$/.test(entry.name)) {
      const text = readFileSync(path, 'utf8');
      assert(!/sb_secret_|-----BEGIN .*PRIVATE KEY-----/.test(text), `Segredo no pacote: ${entry.name}`);
    }
  }
}
inspect(root);
console.log('OK: pacote estatico, referencias locais e configuracao web.');
