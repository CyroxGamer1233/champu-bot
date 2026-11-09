# Champu Bot

Minecraft 1.21.1 Fabric mod + Python/Ollama AI service.

MVP: `/champu spawn`, then `/champu ask <message>` to talk to the Champu NPC.

## AI service

```powershell
cd ai-server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
ollama pull llama3.2:3b
python app.py
```

This is a clean-room implementation and does not copy Player2 proprietary code.

## Player bot mode

The player-bot directory contains a Mineflayer client that joins a LAN world or server as a real player. It supports !champu <message>, !follow, !come, !stop, and !status.

1. Copy player-bot/.env.example to player-bot/.env.
2. Set MC_HOST to the host computer's LAN IPv4 address and MC_PORT to the LAN port.
3. Use MC_AUTH=offline for an offline-mode server, or MC_AUTH=microsoft for an online-mode server.
4. Start the Python AI service, then run npm install and npm start inside player-bot.

