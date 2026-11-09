# Champu AI

Champu is a Minecraft companion project with a Python AI brain and a game-client adapter.

## Current status

- **Java Edition:** Mineflayer player client. Tested only by the user in their own server; no live server/build test is performed by this repository automation.
- **AI brain:** Hybrid provider order (local Ollama first, cloud fallback). The cloud provider is OpenAI-compatible and configured through environment variables.
- **Memory:** Per-player SQLite conversation memory stored locally in `ai-server/champu_memory.sqlite3`.
- **World awareness:** The Java client sends position, health, food, dimension, time/weather, nearby players and nearby entities to the AI.
- **Actions:** Owner-gated follow, come, stop and look actions. Pathfinding is configured not to dig blocks or build towers.
- **Autonomy:** Optional periodic idle-think loop. It is deliberately restricted to low-risk companion actions.

**Bedrock / MCPE:** The current player adapter uses Mineflayer and therefore connects to Java-compatible servers, not directly to a native Bedrock LAN world. The AI API is edition-neutral, but a native Bedrock protocol/gameplay adapter is a separate implementation and is not included in this release. Do not treat Bedrock support as complete yet.

This is an autonomous companion prototype, not human-level AGI. Keep it on a private/test world until you have tested it.

## 1. AI brain setup

Python 3.10+ recommended.

```powershell
cd ai-server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Install Ollama and pull a model:

```powershell
ollama pull llama3.2:3b
```

Set the provider configuration in your terminal before starting the server:

```powershell
$env:AI_MODE="hybrid"
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="llama3.2:3b"
$env:CLOUD_API_KEY="YOUR_API_KEY"
$env:CLOUD_MODEL="gpt-4o-mini"
python app.py
```

Hybrid mode tries local Ollama first and falls back to the cloud provider if local inference fails. If you do not configure a cloud key, Champu continues to use Ollama and reports an unavailable AI service if Ollama is also offline. Never commit API keys to GitHub.

Health check: `http://127.0.0.1:8000/health`.

## 2. Java player bot setup

```powershell
cd player-bot
Copy-Item .env.example .env
npm install
```

Edit `.env`:
- `MC_HOST`: LAN IPv4 address of the computer hosting the Java server.
- `MC_PORT`: server port (usually 25565; use the actual LAN port shown by Open to LAN).
- `MC_USERNAME`: bot player name.
- `MC_AUTH`: `offline` for offline-mode servers, or `microsoft` for Microsoft-authenticated Java servers.
- `OWNER_NAME`: exact Minecraft username allowed to issue AI and movement commands.
- `AUTONOMOUS_MODE`: `true` enables the limited idle-think loop.

Start the Python service first, then:

```powershell
npm start
```

The computer running the bot must be able to reach both the Minecraft server and the AI server. If the AI server and bot run on different computers, change `AI_URL` and `THINK_URL` to the AI computer's LAN IP, and configure the AI server to listen on the LAN only when your firewall and network are trusted.

## 3. In-game commands

- `!champu <message>` — chat with Champu using current world context.
- `!follow` — follow the owner.
- `!come` — move near the owner.
- `!stop` — stop pathfinding.
- `!status` — report basic status.

Set `OWNER_NAME` before joining a shared server. When it is blank, the AI chat endpoint is not owner-restricted by the bot. Keep the bot on a trusted server.

## 4. Bedrock / MCPE roadmap

A native Bedrock adapter must implement Bedrock authentication, player connection, chat events, world/entity observations and movement/action packets for the target Bedrock protocol version. This is not interchangeable with Mineflayer. Until that adapter is implemented and tested, use the Java adapter only for Java servers.

## Safety and limitations

Champu does not have general-purpose human intelligence. Its decisions depend on the configured language model and the limited world snapshot. The current action allowlist excludes block breaking/placing, inventory use, combat, and redstone. AI-generated text is not proof that a game action succeeded. Test on a disposable world and keep backups.
