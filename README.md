# Compasso

Hábitos, metas, tarefas, agenda e treinos num só lugar, rodando **no seu computador**. Seus dados ficam num banco local (SQLite) na sua máquina: nada vai para a nuvem e ninguém mais tem acesso. Funciona no **Mac** e no **Windows**.

Cada pessoa instala a sua própria cópia. O app começa vazio e você monta do seu jeito: suas categorias, seus hábitos, suas metas.

---

## 1. Instalar

### No Mac

1. Nesta página do GitHub, clique em **Code → Download ZIP** e abra o arquivo baixado para descompactar.
2. Dentro da pasta, dê dois cliques em **`Instalar Compasso (Mac).command`**.
3. Na primeira vez, o macOS avisa que não pode verificar o arquivo, porque ele veio da internet. Para liberar:
   - abra **Ajustes do Sistema → Privacidade e Segurança**, role até o fim e clique em **Abrir Mesmo Assim** ao lado do aviso do Compasso;
   - confirme com sua senha ou Touch ID.
   
   Outra opção: abra o **Terminal**, digite `bash ` (com espaço), arraste o arquivo `Instalar Compasso (Mac).command` para a janela e aperte Enter.
4. Se o Mac ainda não tiver as ferramentas da Apple (que trazem o Python), aparece uma janela pedindo para instalar. Clique em **Instalar**, espere terminar e rode o instalador de novo.
5. Pronto: o Compasso abre no navegador em **http://localhost:8080**.

O macOS pode mostrar o aviso "Itens de segundo plano adicionados" citando `python3`. É o Compasso, que agora liga sozinho quando você entra no Mac. Deixe ativado.

### No Windows

1. Instale o **Python 3** (uma vez só):
   - baixe em https://www.python.org/downloads/windows/;
   - na primeira tela do instalador, marque **Add python.exe to PATH** e clique em **Install Now**.
   
   Também serve o Python da Microsoft Store.
2. Nesta página do GitHub, clique em **Code → Download ZIP**. Clique com o botão direito no arquivo baixado → **Extrair tudo**. Não rode de dentro do ZIP.
3. Dentro da pasta extraída, dê dois cliques em **`Instalar Compasso (Windows).bat`**.
4. Se aparecer "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**.
5. Pronto: o Compasso abre no navegador em **http://localhost:8080**, e daqui para frente liga sozinho quando você entra no Windows.

### Ícone de app

Com o Compasso aberto no navegador:

- **Mac, Safari:** **Arquivo → Adicionar ao Dock**.
- **Chrome:** ícone de instalar na barra de endereço → **Instalar Compasso**.
- **Edge:** menu **⋯ → Aplicativos → Instalar este site como um aplicativo**.

O ícone abre o Compasso numa janela própria, como qualquer app.

---

## 2. Primeiros passos

1. **Ajustes** (canto superior direito): crie suas **categorias**, por exemplo Saúde, Estudos, Trabalho e Finanças, cada uma com uma cor. Elas colorem hábitos, metas e tarefas.
2. **Hábitos → + Hábito**:
   - todo dia, X vezes por semana ou em dias fixos;
   - um hábito de treino pode **marcar sozinho** quando houver treino.
3. **Hábitos → + Meta**: ligue hábitos e tarefas a uma meta e a porcentagem sobe sozinha. Também dá para acompanhar um valor à mão, por exemplo "Juntar R$ 10.000".
4. **Tarefas → + Nova tarefa**: com categoria, prazo, prioridade e repetição. A cor do prazo avisa a urgência:
   - 🔴 **vermelho:** vencida ou até 5 dias;
   - 🟡 **amarelo:** 6 a 7 dias;
   - 🟢 **verde:** 8 dias ou mais.
5. **Claro/escuro:** botão com a lua ou o sol no topo.

---

## 3. Conectar o Google Calendar (opcional)

Mostra os eventos da sua agenda do Google dentro do Compasso, só para leitura. Cada pessoa cria o próprio acesso no Google; leva uns 10 minutos, uma vez só.

1. Entre em **https://console.cloud.google.com** com o seu Gmail.
2. No topo da página, clique no seletor de projeto → **Novo projeto** → nome `Compasso` → **Criar**. Depois selecione esse projeto no mesmo seletor.
3. Ative a API da agenda: menu **☰ → APIs e serviços → Biblioteca**, procure **Google Calendar API** e clique em **Ativar**.
4. Configure a tela de login: menu **☰ → Google Auth Platform** (ou **APIs e serviços → Tela de consentimento OAuth**) → **Começar**.
   - **Informações do app:** nome `Compasso` e o seu e-mail de suporte → **Próxima**.
   - **Público:** **Externo** → **Próxima**.
   - **Dados de contato:** o seu e-mail → **Próxima** → aceite a política → **Criar**.
5. Libere o seu Gmail: em **Público** (Audience), na parte **Usuários de teste**, clique em **+ Add users**, digite o seu Gmail e salve. O app fica no status **Em teste**, e é assim mesmo.
6. Libere a leitura da agenda: em **Acesso a dados** (Data access) → **Adicionar ou remover escopos**, procure `calendar.readonly`, marque `.../auth/calendar.readonly` → **Atualizar** → **Salvar**.
7. Crie o ID: em **Clientes** (Clients) → **+ Criar cliente**.
   - Tipo de aplicativo: **Aplicativo da Web**. Nome: `Compasso`.
   - Em **Origens JavaScript autorizadas**, clique em **+ Adicionar URI** e escreva exatamente `http://localhost:8080`.
   - Não precisa preencher "URIs de redirecionamento". Clique em **Criar**.
8. Copie o **ID do cliente**, que termina em `.apps.googleusercontent.com`. A "chave secreta" não é usada.
9. No Compasso, abra **Ajustes → Google Calendar**, cole o ID em **ID do cliente OAuth** e clique em **Salvar**.
10. Abra **Ajustes** de novo e clique em **Conectar**.
    - Escolha sua conta.
    - No aviso "O Google não verificou este app", clique em **Continuar**: o app é seu, então é esperado.
    - Permita ver suas agendas.

**Pronto:** seus eventos aparecem na Agenda e em "Próximas duas Semanas".

**Bom saber:**
- **Sessão de 1 hora:** o acesso do Google dura 1 hora. Quando expira, aparece **Reconectar** na agenda, e um clique resolve.
- **Outras agendas:** para ver outras agendas além da principal, escreva os IDs delas em **Ajustes → Agendas**, separados por vírgula. O ID fica no Google Agenda → Configurações da agenda → Integrar agenda.
- **"Acesso bloqueado":** o seu Gmail não está nos usuários de teste (passo 5).
- **"redirect_uri_mismatch" ou "origin":** a origem não está escrita exatamente como `http://localhost:8080` (passo 7). Depois de corrigir, espere uns 5 minutos.

---

## 4. Conectar o Strava (opcional)

Importa seus treinos do Strava sozinho, sempre que você abre o Compasso ou clica em **Treinos → Sincronizar Strava**. Cada pessoa cria o próprio app no Strava, porque apps novos do Strava só aceitam o próprio dono.

1. Entre em **https://www.strava.com/settings/api** e crie um app:
   - **Nome do aplicativo:** `Compasso` (ou o que quiser);
   - **Categoria:** qualquer uma;
   - **Website:** `http://localhost:8080`;
   - **Domínio de retorno de chamada de autorização** (Authorization Callback Domain): `localhost`.
   
   Se o Strava pedir um ícone, use qualquer imagem.
2. Na página do app, copie o **Client ID** e o **Client Secret** (clique em "mostrar").
3. No Compasso, abra **Ajustes → Strava**, cole os dois e clique em **Salvar e autorizar**.
4. O Strava pede permissão. Deixe marcada a opção de ver as atividades e confirme. Você volta para a tela de Treinos.

**Pronto quando** aparece "Strava em dia" ou "N atividades importadas". O Client Secret fica só no banco do seu computador e nunca vai para o navegador.

---

## 5. Dia a dia

### Seus dados e backups

| O quê | Mac | Windows |
|---|---|---|
| Banco de dados | `~/Compasso/dados/compasso.db` | `C:\Users\<você>\Compasso\dados\compasso.db` |
| Backups automáticos (1 por dia) | `~/Compasso/dados/backups/` | `C:\Users\<você>\Compasso\dados\backups\` |
| Registro do servidor | `~/Compasso/logs/servidor.log` | `C:\Users\<você>\Compasso\logs\servidor.log` |

- O Compasso faz um backup por dia sozinho. Guarda os últimos 60 dias e o primeiro backup de cada mês, para sempre.
- **Ajustes → Fazer backup agora** salva na hora. **Exportar backup** baixa um arquivo; **Importar backup** restaura.
- De vez em quando, copie a pasta `backups` para um pendrive ou para a nuvem. Se o disco morrer, é isso que salva.

### Atualizar para uma versão nova

Baixe o ZIP de novo nesta página e rode o instalador outra vez. Ele troca só o app; **seus dados não são tocados**. Depois, recarregue a página do Compasso (Cmd+R ou Ctrl+R).

### Ligar, desligar, ver o estado

O Compasso liga sozinho quando você entra no computador. Se precisar controlar na mão:

**Mac** (no Terminal, dentro da pasta do Compasso):

```bash
bash scripts/compasso-mac.sh status
```

Comandos: `status`, `abrir`, `iniciar`, `parar`, `reiniciar`, `log`, `desinstalar`.

**Windows** (no PowerShell, dentro da pasta do Compasso):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\compasso-windows.ps1 status
```

Comandos: `status`, `abrir`, `iniciar`, `parar`, `reiniciar`, `log`, `desinstalar`.

### Desinstalar

Dois cliques em **`Desinstalar Compasso (Mac).command`** ou **`Desinstalar Compasso (Windows).bat`**. O app sai, mas **os dados continuam** na pasta `Compasso/dados`. Apague essa pasta à mão se quiser remover tudo.

---

## 6. Problemas comuns

| Sintoma | Como resolver |
|---|---|
| Navegador diz que não consegue abrir `localhost:8080` | O servidor está parado. Rode o instalador de novo ou use o comando `iniciar` |
| Aviso "Servidor do Compasso fora do ar" dentro do app | Mesmo caso: use `iniciar`. A página se reconecta sozinha |
| "A porta 8080 já está em uso" no registro | Outro programa usa a porta 8080. Feche-o, ou instale noutra porta: no Mac, `COMPASSO_PORT=8090 bash scripts/compasso-mac.sh instalar`; no Windows, rode `$env:COMPASSO_PORT=8090` antes do comando de instalar no PowerShell. A origem no Google também precisa mudar |
| Mac: "não é possível abrir… desenvolvedor não identificado" | Seção 1, passo 3 (Privacidade e Segurança → Abrir Mesmo Assim) |
| Windows: "O Windows protegeu o computador" | **Mais informações → Executar assim mesmo** |
| Windows: "Python 3.9 ou mais novo não foi encontrado" | Instale o Python marcando **Add python.exe to PATH** e rode o instalador de novo |
| Google: "Acesso bloqueado" | Seu Gmail não está em Usuários de teste (seção 3, passo 5) |
| Strava: "recusou a autorização" | Client Secret errado: copie de novo e salve |
| Strava: "recusou o acesso" | **Ajustes → Strava → Desconectar** e autorize de novo |

---

## Privacidade e segurança

- O servidor só aceita conexões **deste computador** (127.0.0.1). Nenhum outro aparelho da rede alcança o seu Compasso.
- Outros sites abertos no navegador não conseguem ler nem gravar seus dados: o servidor recusa endereços que não sejam `localhost` e exige um cabeçalho próprio do app.
- O Client Secret do Strava fica só no banco local. O ID do Google é público por natureza e não dá acesso a nada sozinho.
- Este repositório não contém dado pessoal de ninguém. Backups (`.json`) e bancos (`.db`) nunca entram no Git.

---

## Para quem quer mexer no código

```
compasso/
├── public/                         ← o app (HTML, CSS e JS num arquivo só: index.html)
│   ├── compasso-shim.js            ← liga o app ao servidor local (dados + conectores)
│   ├── logo.svg, ícones, manifest
├── server/compasso.py              ← servidor + banco SQLite + Strava + backups (só Python padrão)
├── scripts/compasso-mac.sh         ← instalador e controle no Mac (LaunchAgent)
├── scripts/compasso-windows.ps1    ← instalador e controle no Windows (pasta Inicializar)
├── Instalar/Desinstalar Compasso (Mac).command e (Windows).bat
└── marca/                          ← logos originais
```

Para testar uma mudança sem tocar nos seus dados, use outra porta e outra pasta:

```bash
python3 server/compasso.py --port 8081 --data /tmp/compasso-teste --open
```

Quando estiver bom, rode o instalador de novo para publicar no seu app. Para levar a mudança aos amigos, envie para o GitHub (`git push`); eles baixam o ZIP novo e reinstalam.
