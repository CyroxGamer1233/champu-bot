# Champu AI — Creator Lab

Champu is an AI companion prototype with a standalone web dashboard and a separate Minecraft Java adapter.

## Included
- Hindi/Hinglish chat website and animated block-character preview.
- AI provider health checks (local Ollama and optional cloud fallback).
- SQLite per-player conversation memory.
- Separate Mineflayer Java adapter; it is not started by the website.
- The avatar is a visual mockup, not a live Minecraft entity.

This is an AGI-inspired prototype, not human-level AGI or proof of consciousness. Custom voice cloning, self-evolving personality and native Bedrock/MCPE connectivity are not implemented.

## Run the website

Python 3.10+:

```bash
cd ai-server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On Windows PowerShell activate with `.venv\\Scripts\\Activate.ps1`.

### Local Ollama
Install Ollama, then:
```bash
ollama pull llama3.2:3b
export AI_MODE=local
export OLLAMA_URL=http://127.0.0.1:11434
export OLLAMA_MODEL=llama3.2:3b
python app.py
```

### Cloud provider
```bash
export AI_MODE=cloud
export CLOUD_API_KEY="your-key"
export CLOUD_MODEL=gpt-4o-mini
python app.py
```

### Hybrid
```bash
export AI_MODE=hybrid
export OLLAMA_URL=http://127.0.0.1:11434
export CLOUD_API_KEY="your-key"
python app.py
```

Hybrid tries Ollama first, then cloud. Never commit API keys. Open http://127.0.0.1:8000. In Codespaces, open forwarded port 8000 in the Ports tab.

## Dashboard
- Chat with memory
- Animated Champu character mockup
- Provider status and memory viewer
- Browser microphone and speech features when supported

Speech uses the browser/device's available voice. It is not a cloned voice.

## API
- `GET /` dashboard
- `GET /health` server/provider status
- `GET /memory?player=Owner&limit=50`
- `POST /chat`
- `POST /think`

The API itself does not connect to Minecraft.

## Optional Java bot
Only when you intentionally want a Java server connection:
```bash
cd player-bot
npm install
```
Configure `.env` from `.env.example`, including MC_HOST, MC_PORT and OWNER_NAME, then run `npm start`. Mineflayer supports Java-compatible servers, not native Bedrock LAN. The current action allowlist is limited to follow, come, stop and look.

## Troubleshooting
- Website unavailable: run `python app.py` from `ai-server`; check port 8000.
- AI not ready: open `/health`; start Ollama or configure a cloud key.
- Chat 503: read the terminal's provider error. Codespaces usually does not have Ollama running unless you set it up.
- Memory empty: send a message; saved turns are in `ai-server/champu_memory.sqlite3`.
