#!/bin/bash
# Dois cliques para instalar (ou atualizar) o Compasso neste Mac. Seus dados nunca são apagados.
cd "$(dirname "$0")" || exit 1
bash scripts/compasso-mac.sh instalar
echo
read -n 1 -s -r -p "Pressione qualquer tecla para fechar esta janela."
