import json
import os
import sqlite3
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
DB_PATH = Path(os.getenv("CHAMPU_MEMORY_DB", str(APP_DIR / "champu_memory.sqlite3")))
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
CLOUD_BASE_URL = os.getenv("CLOUD_BASE_URL", "https://api.openai.com/v1")
CLOUD_MODEL = os.getenv("CLOUD_MODEL", "gpt-4o-mini")
CLOUD_API_KEY = os.getenv("CLOUD_API_KEY", "")
AI_MODE = os.getenv("AI_MODE", "hybrid").lower()
MAX_MEMORY = int(os.getenv("MAX_MEMORY", "16"))

app = FastAPI(title="Champu AI Brain", version="0.3.0")


def db():
    connection = sqlite3.connect(DB_PATH)
    connection.execute("CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, player TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
    return connection


class ChatRequest(BaseModel):
    player: str = Field(default="Player", max_length=32)
    message: str = Field(min_length=1, max_length=1200)
    world: dict[str, Any] = Field(default_factory=dict)
    remember: bool = True


class ThinkRequest(BaseModel):
    player: str = Field(default="Champu", max_length=32)
    world: dict[str, Any] = Field(default_factory=dict)


def get_memory(player: str):
    with db() as connection:
        rows = connection.execute("SELECT role, content FROM memories WHERE player=? ORDER BY id DESC LIMIT ?", (player, MAX_MEMORY)).fetchall()
    return [{"role": role, "content": content} for role, content in reversed(rows)]


def save_memory(player: str, role: str, content: str):
    with db() as connection:
        connection.execute("INSERT INTO memories(player, role, content) VALUES(?,?,?)", (player, role, content[:2000]))
        connection.execute("DELETE FROM memories WHERE player=? AND id NOT IN (SELECT id FROM memories WHERE player=? ORDER BY id DESC LIMIT ?)", (player, player, MAX_MEMORY * 4))


def system_prompt(world: dict[str, Any]):
    safe_world = json.dumps(world, ensure_ascii=False)[:3500]
    return (
        "You are Champu, a friendly, curious Minecraft companion. Speak naturally and briefly; "
        "prefer Hindi/Hinglish when the player uses it. You are an AI character, not a human. "
        "In standalone mode, talk naturally about your current conversation and remembered experiences. "
        "Use the supplied world snapshot only when relevant; never invent live Minecraft observations. "
        "Never claim an action is complete unless the game reports it. Do not destroy blocks, attack players, "
        "enter lava, or spend items. If the player clearly requests movement, return one action from "
        "follow, come, stop, look, none. Return ONLY JSON with keys reply (string) and action "
        "(object with key type). World snapshot: " + safe_world
    )


async def ask_ollama(messages):
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(f"{OLLAMA_URL}/api/chat", json={"model": OLLAMA_MODEL, "messages": messages, "stream": False, "format": "json", "options": {"temperature": 0.6}})
        response.raise_for_status()
        return response.json()["message"]["content"], f"ollama:{OLLAMA_MODEL}"


async def ask_cloud(messages):
    if not CLOUD_API_KEY:
        raise RuntimeError("CLOUD_API_KEY is not configured")
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(f"{CLOUD_BASE_URL.rstrip('/')}/chat/completions", headers={"Authorization": f"Bearer {CLOUD_API_KEY}"}, json={"model": CLOUD_MODEL, "messages": messages, "temperature": 0.6, "response_format": {"type": "json_object"}})
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"], f"cloud:{CLOUD_MODEL}"


async def generate(messages):
    errors = []
    providers = [ask_ollama, ask_cloud] if AI_MODE == "hybrid" else ([ask_cloud] if AI_MODE == "cloud" else [ask_ollama])
    for provider in providers:
        try:
            return await provider(messages)
        except Exception as error:
            errors.append(str(error))
    raise HTTPException(status_code=503, detail="All configured AI providers are unavailable: " + "; ".join(errors))


def parse_result(raw: str):
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {"reply": raw, "action": {"type": "none"}}
    action_type = (data.get("action") or {}).get("type", "none")
    if action_type not in {"follow", "come", "stop", "look", "none"}:
        action_type = "none"
    return {"reply": str(data.get("reply", "Hmm, mujhe samajh nahi aaya."))[:500], "action": {"type": action_type}}


@app.get("/")
async def dashboard():
    index = WEB_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Dashboard files are missing")
    return FileResponse(index)


@app.get("/health")
async def health():
    return {"ok": True, "mode": AI_MODE, "local_model": OLLAMA_MODEL, "cloud_configured": bool(CLOUD_API_KEY), "memory": "sqlite", "minecraft_connected": False}


@app.get("/memory")
async def memory(player: str = Query(default="Owner", max_length=32), limit: int = Query(default=50, ge=1, le=100)):
    with db() as connection:
        rows = connection.execute("SELECT role, content, created_at FROM memories WHERE player=? ORDER BY id DESC LIMIT ?", (player, limit)).fetchall()
    return {"player": player, "items": [{"role": role, "content": content, "created_at": created_at} for role, content, created_at in reversed(rows)]}


@app.post("/chat")
async def chat(request: ChatRequest):
    messages = [{"role": "system", "content": system_prompt(request.world)}]
    messages.extend(get_memory(request.player))
    messages.append({"role": "user", "content": request.message})
    raw, provider = await generate(messages)
    result = parse_result(raw)
    if request.remember:
        save_memory(request.player, "user", request.message)
        save_memory(request.player, "assistant", result["reply"])
    result["model"] = provider
    return result


@app.post("/think")
async def think(request: ThinkRequest):
    messages = [
        {"role": "system", "content": system_prompt(request.world) + " Idle mode: choose none unless a safe, immediately useful companion action is obvious."},
        {"role": "user", "content": "Review the current world snapshot. Should you do anything?"},
    ]
    raw, provider = await generate(messages)
    result = parse_result(raw)
    result["model"] = provider
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("AI_HOST", "127.0.0.1"), port=int(os.getenv("AI_PORT", "8000")))
