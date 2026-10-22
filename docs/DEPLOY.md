# Publicação web do Compasso

## Arquitetura

GitHub é a fonte do código. O workflow `.github/workflows/pages.yml` verifica branches e pull requests. Depois do merge de um PR na `main`, repete as verificações e envia somente `public/` ao projeto Cloudflare Pages existente `compasso-dipaula`. Não há compilação de frontend. O backend Supabase e a instalação Python/SQLite não são publicados nem modificados pelo pipeline.

O projeto usa Direct Upload, sem integração Git nativa. GitHub Actions mantém o projeto e seu domínio, sem migração ou recriação. O tipo de trigger no Cloudflare pode continuar aparecendo como `ad_hoc`: isso descreve o upload via API, mesmo quando iniciado automaticamente pelo Actions.

## Ativação inicial (administrador)

O código do workflow não basta para ativar o acesso ao Cloudflare. Antes do primeiro merge:

1. Criar um API Token Cloudflare com permissão **Account / Cloudflare Pages / Edit**, restrito à conta `38eeed1e13c88c3177cbb6e8a63629a1`. Essa permissão cobre Pages da conta; não presumir isolamento por projeto. Nunca enviar o token por chat ou colocá-lo em arquivos.
2. Em GitHub Settings → Environments, criar `production`, limitar deployment branches a `main` e cadastrar o environment secret `CLOUDFLARE_API_TOKEN`. Inicialmente, usar um revisor obrigatório para liberar a primeira publicação. Depois da aprovação inicial, esse controle pode ser retirado caso a aprovação do PR deva ser a única intervenção humana.
3. Proteger `main` por ruleset: exigir PR, pelo menos uma aprovação independente, invalidar aprovações antigas após novos commits, exigir resolução de conversas e o check **Verificacoes** atualizado antes do merge. Bloquear force push e exclusão, incluindo administradores quando adequado. O check deve executar pelo menos uma vez para aparecer na seleção. Sem isso, o código ainda pode entrar na main sem revisão. Em repositório de um único mantenedor, uma aprovação independente exige outro colaborador.
4. Opcionalmente criar o environment `preview`, com revisor obrigatório e o mesmo secret, e a repository variable `COMPASSO_ENABLE_PREVIEWS=true`. O token Pages tem alcance de conta; o revisor precisa inspecionar código e workflow antes de liberá-lo a uma branch. Previews ficam desativadas sem essa variável. PRs de forks não recebem credenciais nem deploy.
5. Validar uma prévia, aprovar o PR e autorizar a primeira publicação. A produção só muda no job de produção após merge e liberação do environment. Não integrar este PR antes dessa autorização.

Os conectores usados na preparação não permitem cadastrar secrets ou alterar regras administrativas do GitHub. Esses passos precisam ser concluídos pelo administrador; não presumir que já estão ativos.

## Desenvolver e revisar

Criar uma branch a partir da main atualizada. Respeitar `AGENTS.md`, preservar a identidade visual e manter dados reais fora do Git. Rodar `node scripts/verify-ux.mjs` e `node scripts/verify-pages.mjs`. O CI também analisa a sintaxe Python sem iniciar o servidor nem abrir banco de dados.

Abrir PR para `main`. Conferir o job **Verificacoes**, revisar o diff e validar visualmente mudanças de interface. Os testes automatizados não substituem a revisão visual e não fazem login nem gravam no Supabase.

Com previews habilitadas, o job **Previa Pages** publica em uma branch `preview-pr-N`, com URL própria mostrada no environment e no resumo do job. A prévia usa a configuração Supabase existente: não é um banco de testes. Para validar a publicação, usar apenas carregamento de arquivos, sem alterar dados ou autenticação. Não configurar novos redirects ou permissões de auth por causa da prévia.

## Publicar e acompanhar

Ao integrar um PR na main, o job **Producao Pages** verifica que o commit corresponde ao merge de um PR, recusa execuções antigas se a main já avançou e publica somente após os testes. Push direto na main não publica por esse workflow. Proteção de branch continua necessária para garantir revisão humana.

O pipeline usa ações fixadas por SHA, Wrangler `4.152.0`, permissões GitHub mínimas e segredos apenas nos jobs de deploy. Publicações de produção são serializadas, sem cancelar upload em andamento. Evitar merges simultâneos durante a publicação.

Acompanhar em GitHub → Actions → **Compasso CI e Pages**, no environment do repositório e em Cloudflare → Workers & Pages → compasso-dipaula → Deployments. O resumo registra URL, commit e ID. O último passo consulta o status Cloudflare e compara quatro arquivos servidos com o checkout, incluindo a configuração e o adaptador de dados. Uma falha nessa confirmação pode acontecer após o upload já ter publicado: conferir o Cloudflare antes de repetir.

Produção permanece em https://compasso-dipaula.pages.dev. Para repetir um deploy com falha, usar **Re-run failed jobs** na execução do último commit da main. Não há gatilho manual para publicar uma branch em produção.

## Recuperação e limites

Antes de substituir produção, manter o ID da implantação anterior. Na preparação inicial, era `2a1251a4-ead2-4ed2-9884-84a933386eea`, commit `57b272f094f57ab85ab27967a7c773125847d374`, publicada em 22/10/2026 às 10h20 (São Paulo).

Se necessário, interromper novos merges e realizar rollback para um deployment de produção anterior no painel Cloudflare, mediante aprovação do responsável. Depois corrigir ou reverter por PR para que Git e produção voltem a coincidir. Não há rollback automático nem migrações de dados neste fluxo.

Actions e Cloudflare precisam de conta ativa, permissões e cotas disponíveis. Revisar atualizações de ações e Wrangler por PR. O instalador local continua sendo atualizado separadamente; o deploy web não atualiza instalações nem sincroniza bancos SQLite.

Referência: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
