# Padrão de interações do Compasso

A prévia aprovada foi integrada em 21/10/2026. A identidade visual existente permanece a referência para qualquer alteração. As regras obrigatórias estão em `AGENTS.md`.

## Implementação compartilhada

- `public/compasso-motion.js`: durações, curvas e risco medido nos fragmentos reais do texto, incluindo números e quebras de linha.
- `public/compasso-interactions.js`: navegação, indicador, conclusão de hábitos/tarefas, cancelamento e desfazer, com os mesmos comportamentos entre telas.
- `public/compasso-motion.css`: ajustes de comportamento usando a paleta, fontes e componentes existentes.
- `public/compasso-ux.js`: organização dos componentes, atalhos, período dos mapas e foco dos formulários.

Os helpers são carregados antes da inicialização do aplicativo. Os adaptadores reais, autenticação, recorrências, sincronização e persistência permanecem ativos. Arquivos de demonstração em `preview-ux/` não fazem parte da distribuição.

## Verificação

Execute `node scripts/verify-ux.mjs`. Ao alterar conclusão ou navegação, confira também no navegador: frases curtas, longas, números, múltiplas linhas, computador/celular, marcar/desmarcar, trocar de tela, desfazer e preferência por movimento reduzido. O risco se limita ao nome e nunca alcança metadados.

## Publicação

Publicar somente `public/` no projeto Pages `compasso-dipaula`. O service worker não armazena telas nem dados; reabrir/recarregar o aplicativo busca o código atualizado. O site compartilhado atende computador e celular. Instalações do servidor Python usam uma cópia de código separada e mantêm seus dados locais.
