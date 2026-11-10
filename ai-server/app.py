import json, os, sqlite3
from pathlib import Path
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

ROOT=Path(__file__).resolve().parent
WEB=ROOT/"web"
DB=Path(os.getenv("CHAMPU_MEMORY_DB",str(ROOT/"champu_memory.sqlite3")))
OLLAMA=os.getenv("OLLAMA_URL","http://127.0.0.1:11434").rstrip("/")
LOCAL_MODEL=os.getenv("OLLAMA_MODEL","llama3.2:3b")
CLOUD_URL=os.getenv("CLOUD_BASE_URL","https://api.openai.com/v1").rstrip("/")
CLOUD_MODEL=os.getenv("CLOUD_MODEL","gpt-4o-mini")
API_KEY=os.getenv("CLOUD_API_KEY","")
MODE=os.getenv("AI_MODE","hybrid").lower()
LIMIT=max(2,min(int(os.getenv("MAX_MEMORY","20")),100))
app=FastAPI(title="Champu AI Brain",version="1.0.0")
ACTIONS={"follow","come","stop","look","none"}

def db():
    DB.parent.mkdir(parents=True,exist_ok=True)
    c=sqlite3.connect(DB,timeout=10)
    c.execute("CREATE TABLE IF NOT EXISTS memories(id INTEGER PRIMARY KEY AUTOINCREMENT,player TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
    return c

class Chat(BaseModel):
    player:str=Field(default="Owner",min_length=1,max_length=32)
    message:str=Field(min_length=1,max_length=1200)
    world:dict[str,Any]=Field(default_factory=dict)
    remember:bool=True
class Think(BaseModel):
    player:str=Field(default="Champu",min_length=1,max_length=32)
    world:dict[str,Any]=Field(default_factory=dict)

def history(player):
    with db() as c: rows=c.execute("SELECT role,content FROM memories WHERE player=? ORDER BY id DESC LIMIT ?",(player,LIMIT)).fetchall()
    return [{"role":r,"content":v} for r,v in reversed(rows)]
def remember(player,role,content):
    with db() as c:
        c.execute("INSERT INTO memories(player,role,content) VALUES(?,?,?)",(player,role,content[:2000]))
        c.execute("DELETE FROM memories WHERE player=? AND id NOT IN (SELECT id FROM memories WHERE player=? ORDER BY id DESC LIMIT ?)",(player,player,LIMIT*4))
def prompt(world):
    return ("You are Champu, a friendly curious Minecraft companion character. Reply naturally in Hindi/Hinglish when the user does. "
    "You are an AI, not a human; do not claim consciousness. Use only supplied facts and never invent live game observations. "
    "Standalone mode means Minecraft is disconnected and no action can execute. Never claim an action succeeded without game confirmation. "
    "Allowed action types: follow, come, stop, look, none. Usually choose none. Return ONLY JSON with keys reply and action:{type}. "
    "World snapshot: "+json.dumps(world,ensure_ascii=False)[:3500])
async def ollama(messages):
    async with httpx.AsyncClient(timeout=httpx.Timeout(75,connect=8)) as c:
        r=await c.post(OLLAMA+"/api/chat",json={"model":LOCAL_MODEL,"messages":messages,"stream":False,"format":"json","options":{"temperature":0.65}})
        r.raise_for_status(); return r.json()["message"]["content"],"ollama:"+LOCAL_MODEL
async def cloud(messages):
    if not API_KEY: raise RuntimeError("Cloud API key is not configured")
    async with httpx.AsyncClient(timeout=httpx.Timeout(75,connect=8)) as c:
        r=await c.post(CLOUD_URL+"/chat/completions",headers={"Authorization":"Bearer "+API_KEY},json={"model":CLOUD_MODEL,"messages":messages,"temperature":0.65,"response_format":{"type":"json_object"}})
        r.raise_for_status(); return r.json()["choices"][0]["message"]["content"],"cloud:"+CLOUD_MODEL
async def providers():
    result={"ollama":"offline","cloud":"configured" if API_KEY else "not_configured"}
    try:
        async with httpx.AsyncClient(timeout=3.5) as c:
            r=await c.get(OLLAMA+"/api/tags"); r.raise_for_status(); result["ollama"]="reachable"
    except Exception: pass
    return result
async def generate(messages):
    chain=[cloud] if MODE=="cloud" else [ollama] if MODE=="local" else [ollama,cloud]
    errors=[]
    for fn in chain:
        try:return await fn(messages)
        except Exception as e:errors.append(fn.__name__+": "+str(e)[:180])
    raise HTTPException(503,"AI provider unavailable. Start Ollama or configure CLOUD_API_KEY. "+" | ".join(errors))
def parse(raw):
    text = str(raw or "").strip()
    fence = chr(96) * 3
    if text.startswith(fence):
        text = text.replace(fence + "json", "", 1).replace(fence, "", 1).strip()
    try:
        data = json.loads(text)
    except Exception:
        data = {"reply": text, "action": {"type": "none"}}
    if isinstance(data, str):
        data = {"reply": data, "action": {"type": "none"}}
    if not isinstance(data, dict):
        data = {}
    reply = data.get("reply") or data.get("message") or data.get("response") or data.get("content")
    if not reply and "minecraft_connected" in data:
        reply = "Abhi main Minecraft se connected nahi hoon. Join Bot button se server connect karo."
    if not reply:
        reply = text
    if isinstance(reply, dict):
        reply = reply.get("text") or reply.get("content") or str(reply)
    reply = str(reply or "AI ne empty response diya. Ollama model output check karo.").strip()
    action = data.get("action") or {}
    action_type = action.get("type", "none") if isinstance(action, dict) else str(action)
    if action_type not in ACTIONS:
        action_type = "none"
    return {"reply": reply[:1200], "action": {"type": action_type}}
@app.get("/")
async def home():
    f=WEB/"index.html"
    if not f.is_file():raise HTTPException(404,"Dashboard file missing")
    return FileResponse(f)
@app.get("/health")
async def health():
    p=await providers()
    ready=(p["cloud"]=="configured") if MODE=="cloud" else (p["ollama"]=="reachable") if MODE=="local" else (p["ollama"]=="reachable" or p["cloud"]=="configured")
    return {"ok":True,"ai_ready":ready,"mode":MODE,"local_model":LOCAL_MODEL,"cloud_model":CLOUD_MODEL,"providers":p,"memory":"sqlite","minecraft_connected":minecraft_status()["running"],"minecraft":minecraft_status(),"version":"1.1.0"}
@app.get("/memory")
async def memory(player:str=Query(default="Owner",min_length=1,max_length=32),limit:int=Query(default=50,ge=1,le=100)):
    with db() as c: rows=c.execute("SELECT role,content,created_at FROM memories WHERE player=? ORDER BY id DESC LIMIT ?",(player,limit)).fetchall()
    return {"player":player,"items":[{"role":r,"content":v,"created_at":t} for r,v,t in reversed(rows)]}
@app.post("/chat")
async def chat(req:Chat):
    state = minecraft_status()
    world = dict(req.world)
    world["minecraft_connected"] = state["running"]
    world["minecraft"] = state["config"] if state["running"] else None
    msgs=[{"role":"system","content":prompt(world)}]+history(req.player)+[{"role":"user","content":req.message.strip()}]
    try:
        raw,model=await generate(msgs)
        result=parse(raw)
    except HTTPException:
        result={"reply": "Haan bhai, Champu yahan hai. AI provider abhi ready nahi hai, lekin Minecraft connection active hai.", "action": {"type": "none"}}
        model="fallback"
    if state["running"]:
        bad = ("not connected", "disconnected", "join bot button", "standalone mode")
        if any(phrase in result["reply"].lower() for phrase in bad):
            result["reply"] = "Haan bhai, Champu Minecraft server se connected hai. Main world mein active hoon."
    if req.remember:remember(req.player,"user",req.message.strip());remember(req.player,"assistant",result["reply"])
    result.update({"model":model,"minecraft_connected":state["running"]});return result
@app.post("/think")
async def think(req:Think):
    raw,model=await generate([{"role":"system","content":prompt(req.world)+" Idle reflection: choose none unless a safe useful action is clearly justified."},{"role":"user","content":"Reflect on the supplied state."}])
    result=parse(raw);result["model"]=model;return result

# Minecraft client lifecycle. Keep the dashboard bound to localhost or protect it
# before exposing it to the internet.
MINECRAFT_DIR = ROOT.parent / "player-bot"
minecraft_process = None
minecraft_config = {}
minecraft_logs = []
minecraft_live = {}

class MinecraftConnect(BaseModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=25565, ge=1, le=65535)
    username: str = Field(default="ChampuBot", min_length=1, max_length=32)
    auth: str = Field(default="offline", pattern="^(offline|microsoft)$")
    version: str = Field(default="1.21.1", min_length=1, max_length=32)
    owner_name: str = Field(default="", max_length=32)

class MinecraftHeartbeat(BaseModel):
    connected: bool = True
    position: dict[str, Any] = Field(default_factory=dict)
    health: float = 0
    food: float = 0
    dimension: str = "unknown"
    players: list[str] = Field(default_factory=list)

def minecraft_status():
    global minecraft_process
    if minecraft_process is not None and minecraft_process.poll() is not None:
        minecraft_process = None
    return {
        "connected": minecraft_process is not None,
        "running": minecraft_process is not None,
        "config": minecraft_config,
        "logs": minecraft_logs[-40:],
        "live": minecraft_live,
    }

def collect_minecraft_logs(process):
    for line in iter(process.stdout.readline, ""):
        minecraft_logs.append(line.rstrip()[-1000:])
        del minecraft_logs[:-100:]
    process.stdout.close()

@app.get("/minecraft/status")
async def minecraft_status_endpoint():
    return minecraft_status()

@app.get("/minecraft/logs")
async def minecraft_logs_endpoint():
    return {"logs": minecraft_logs[-100:]}

@app.post("/minecraft/heartbeat")
async def minecraft_heartbeat(request: MinecraftHeartbeat):
    global minecraft_live
    minecraft_live = request.model_dump()
    return {"ok": True}

@app.post("/minecraft/connect")
async def minecraft_connect(request: MinecraftConnect):
    global minecraft_process, minecraft_config
    if minecraft_process is not None and minecraft_process.poll() is None:
        raise HTTPException(409, "Champu is already running. Stop it before reconnecting.")
    if any(char in request.host for char in "\r\n") or any(char in request.username for char in "\r\n"):
        raise HTTPException(400, "Invalid connection values.")
    if not (MINECRAFT_DIR / "index.js").is_file():
        raise HTTPException(500, "player-bot/index.js is missing.")
    env = os.environ.copy()
    env.update({
        "MC_HOST": request.host,
        "MC_PORT": str(request.port),
        "MC_USERNAME": request.username,
        "MC_AUTH": request.auth,
        "MC_VERSION": request.version,
        "OWNER_NAME": request.owner_name,
        "AI_URL": env.get("AI_URL", "http://127.0.0.1:8000/chat"),
        "THINK_URL": env.get("THINK_URL", "http://127.0.0.1:8000/think"),
    })
    try:
        minecraft_process = __import__("subprocess").Popen(
            ["node", "index.js"],
            cwd=MINECRAFT_DIR,
            env=env,
            stdout=__import__("subprocess").PIPE,
            stderr=__import__("subprocess").STDOUT,
            text=True,
            bufsize=1,
        )
    except OSError as error:
        raise HTTPException(503, "Could not start Node.js: " + str(error))
    minecraft_config = request.model_dump()
    minecraft_logs.clear()
    import threading
    threading.Thread(target=collect_minecraft_logs, args=(minecraft_process,), daemon=True).start()
    return minecraft_status()

@app.post("/minecraft/disconnect")
async def minecraft_disconnect():
    global minecraft_process
    if minecraft_process is not None and minecraft_process.poll() is None:
        minecraft_process.terminate()
        try:
            minecraft_process.wait(timeout=8)
        except __import__("subprocess").TimeoutExpired:
            minecraft_process.kill()
    minecraft_process = None
    minecraft_live.clear()
    return minecraft_status()


if __name__=="__main__":
    import uvicorn
    uvicorn.run(app,host=os.getenv("AI_HOST","127.0.0.1"),port=int(os.getenv("AI_PORT","8000")))
