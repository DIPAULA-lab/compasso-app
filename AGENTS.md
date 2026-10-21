# Preservação do design e do trade dress

Instrução permanente do usuário para este projeto:

- Não alterar cores, fontes, padrões, desenhos, ícones, formatos, raios, sombras, proporções de componentes nem a identidade visual existente.
- Implementar funcionalidades e protótipos usando os componentes, estilos e recursos gráficos que o aplicativo já utiliza.
- Alterar o visual somente quando o usuário pedir essa alteração explicitamente. Pedidos de features, correções, UX ou protótipos não autorizam um redesenho.
- Demonstrar mudanças em uma prévia separada quando houver validação pendente; não aplicar nem publicar antes dessa validação.
- Preservar os dados e as funcionalidades existentes. Não substituir trabalho local mais recente por cópias antigas.

Para alterações estruturais já solicitadas, reorganizar os componentes existentes sem redesenhá-los. Se uma melhoria depender de mudar sua aparência, mantê-la fora da implementação até um pedido visual explícito.

## Padrão de movimento aprovado do Compasso

Esta é uma regra permanente para novas funcionalidades, protótipos e alterações do aplicativo. Reutilizar o padrão aprovado; não criar efeitos independentes por tela.

- A implementação de referência está em `public/compasso-motion.js`, `public/compasso-interactions.js`, `public/compasso-ux.js` e `public/compasso-motion.css`. A integração oficial foi autorizada após validação da prévia. Reutilizar os helpers oficiais; nunca publicar dados ou substituições da demonstração.
- Usar `COMPASSO_MOTION` para as durações e curvas: resposta curta 120 ms, estado/tela 240 ms, seleção da aba 300 ms, confirmação do controle 360 ms, risco 420 ms, espera de confirmação antes da saída 520 ms e recolhimento 280 ms. Preservar os movimentos de formulários, anéis e indicadores já existentes; novos casos devem reutilizar suas implementações aprovadas.
- Conclusão de tarefa ou hábito: responder imediatamente no controle, usar o mesmo pulso e desenhar o risco sobre o nome. Depois, manter o risco e o tom de texto concluído enquanto aquele registro estiver concluído para a data exibida. Desmarcar remove o risco.
- O risco deve usar os fragmentos reais do texto renderizado (`Range.getClientRects()`), nunca 100% da largura do contêiner, botão, linha ou cartão. Unir fragmentos de uma mesma linha, respeitar os limites visíveis e animar cada linha de uma frase quebrada em ordem de leitura. Não riscar metadados, categorias ou prazos.
- Usar `compassoAnimateStrike()` para hábitos e tarefas em todas as telas. Preservar o efeito durante as atualizações do conteúdo, cancelar corretamente ao desfazer e remover elementos temporários ao terminar. Redimensionamento não pode deixar riscos soltos ou fora do texto.
- Navegação: o indicador se move atrás dos nomes sem ocultá-los. Animar somente o conteúdo da página, mantendo logo, cabeçalho e navegação fixos. Reservar espaço consistente para a barra de rolagem.
- Interações rápidas devem cancelar/reaproveitar a animação anterior a partir da posição atual, sem duplicar controles ou registros. Desfazer durante a saída deve restaurar a mesma linha.
- Respeitar `prefers-reduced-motion`: manter feedback e estado corretos sem exigir animação. Preservar foco de teclado e acessibilidade; camadas de animação não recebem eventos nem entram na árvore de acessibilidade.
- A animação não autoriza mudar a identidade visual. Reutilizar cores, fontes, ícones, espessura do risco e estados existentes, incluindo os prazos vermelho (vencido ou até 5 dias), amarelo (6–7) e verde (8+).
- Antes de entregar uma mudança que envolva conclusão, conferir nomes curtos, longos, números e múltiplas linhas; computador e celular; marcar, desmarcar, trocar de tela e desfazer durante a animação. As linhas animadas devem terminar no texto, inclusive na Agenda.
