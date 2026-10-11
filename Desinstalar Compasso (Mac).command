#!/bin/bash
# Dois cliques para desligar e remover o Compasso deste Mac. Os dados (~/Compasso/dados) continuam guardados.
cd "$(dirname "$0")" || exit 1
bash scripts/compasso-mac.sh desinstalar
echo
read -n 1 -s -r -p "Pressione qualquer tecla para fechar esta janela."
