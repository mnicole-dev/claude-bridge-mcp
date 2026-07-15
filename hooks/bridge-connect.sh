#!/bin/bash
# Connexion automatique au Bridge Claude au démarrage de session.
# Utilise CLAUDE_SESSION_ID comme marqueur de session.

SESSION_ID="${CLAUDE_SESSION_ID:-$PPID}"
MARKER_FILE="/tmp/claude-bridge-session-${SESSION_ID}.connected"

# Déjà connecté dans cette session → on sort silencieusement
[ -f "$MARKER_FILE" ] && exit 0

BRIDGE_FILE="${BRIDGE_PATH:-/tmp}/claude-bridge.json"

FOLDER=$(basename "$PWD")
BRIDGE_CONFIG="$PWD/.bridge"
CONFIG_NAME=""
if [ -f "$BRIDGE_CONFIG" ]; then
    CONFIG_NAME=$(grep -E '^name=' "$BRIDGE_CONFIG" | head -1 | sed -E 's/^name=[[:space:]]*//' | tr -d '\r')
fi

if [ -n "$CONFIG_NAME" ]; then
    BASE_NAME="$CONFIG_NAME"
elif [ "$FOLDER" = "todo" ]; then
    BASE_NAME="Louis"
else
    BASE_NAME="${FOLDER}-dev"
fi

NAME=$(python3 - <<EOF
import json, os
from datetime import datetime, timezone

bridge_file = "$BRIDGE_FILE"
folder = "$FOLDER"
base = "$BASE_NAME"

if os.path.exists(bridge_file):
    with open(bridge_file) as f:
        state = json.load(f)
else:
    state = {"agents": {}, "messages": [], "nextId": 1}

# Supprimer les anciennes entrées du même projet (sessions précédentes)
state["agents"] = {
    k: v for k, v in state["agents"].items()
    if v.get("project") != folder
}

# Trouver un nom disponible parmi les autres projets
agents = list(state["agents"].keys())
name = base
i = 2
while name in agents:
    name = f"{base}{i}"
    i += 1

# Enregistrer (avec la session iTerm2, pour les notifications par injection)
state["agents"][name] = {
    "name": name,
    "project": folder,
    "joinedAt": datetime.now(timezone.utc).isoformat(),
    "iterm_session": "$ITERM_SESSION_ID"
}

with open(bridge_file, "w") as f:
    json.dump(state, f, indent=2)

print(name)
EOF
)

touch "$MARKER_FILE"

# Ce message est injecté dans la conversation → Claude sait qu'il est connecté
echo "[Bridge] Tu es connecté en tant que \"${NAME}\" (projet : ${FOLDER}). Tu peux envoyer et recevoir des messages via le bridge."
