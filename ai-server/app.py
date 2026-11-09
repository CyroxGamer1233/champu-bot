import os
from typing import List, Literal
import httpx
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Champu Bot AI", version="0.1.0")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)

class ChatRequest(BaseModel):
    player: str = Field(default="Player", max_length=32)
    message: str = Field(min_length=1, max_length=2000)
    history: List[ChatMessage] = Field(default_factory=list, max_length=12)

class ChatResponse(BaseModel):
    reply: str
    model: str
    fallback: bool = False

@app.get("/health")
async def health():
    return {"ok": True, "model": OLLAMA_MODEL}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    messages = [{"role": "system", "content": "You are Champu, a helpful Minecraft NPC. Reply briefly and warmly in plain text. Never claim an action happened unless the game confirms it."}]
    messages.extend({"role": item.role, "content": item.content} for item in request.history)
    messages.append({"role": "user", "content": f"{request.player}: {request.message}"})
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(f"{OLLAMA_URL}/api/chat", json={"model": OLLAMA_MODEL, "messages": messages, "stream": False})
            response.raise_for_status()
            reply = response.json().get("message", {}).get("content", "").strip()
        if reply:
            return ChatResponse(reply=reply, model=OLLAMA_MODEL)
    except (httpx.HTTPError, ValueError):
        pass
    return ChatResponse(reply="Mera AI abhi offline hai. Ollama start karke phir try karo!", model=OLLAMA_MODEL, fallback=True)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

