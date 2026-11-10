import mineflayer from 'mineflayer';
import pathfinderPackage from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pathfinderPackage;
import axios from 'axios';

const env = (key, fallback = '') => process.env[key] || fallback;
const host = env('MC_HOST', '127.0.0.1');
const port = Number(env('MC_PORT', '25565'));
const username = env('MC_USERNAME', 'ChampuBot');
const auth = env('MC_AUTH', 'offline');
const version = env('MC_VERSION', '1.21.1');
const aiUrl = env('AI_URL', 'http://127.0.0.1:8000/chat');
const thinkUrl = env('THINK_URL', aiUrl.replace(/\/chat$/, '/think'));
const heartbeatUrl = env('HEARTBEAT_URL', aiUrl.replace(/\/chat$/, '/minecraft/heartbeat'));
const ownerName = env('OWNER_NAME');
const autonomous = env('AUTONOMOUS_MODE', 'true').toLowerCase() === 'true';
const thinkInterval = Math.max(30000, Number(env('THINK_INTERVAL_MS', '60000')));
const allowedActions = new Set(['follow', 'come', 'stop', 'look', 'none']);

let bot;
let thinkTimer;
let thinking = false;
let reconnectTimer;
let heartbeatTimer;
let lastAutoAction = 'none';
const history = [];

function say(message) {
  if (bot?.entity) bot.chat(String(message).replace(/[\r\n]/g, ' ').slice(0, 240));
}

function isOwner(sender) {
  return !ownerName || sender.toLowerCase() === ownerName.toLowerCase();
}

function snapshot() {
  if (!bot?.entity) return {};
  const p = bot.entity.position;
  const nearbyPlayers = Object.values(bot.players)
    .filter(player => player.username !== bot.username && player.entity)
    .slice(0, 8)
    .map(player => ({
      name: player.username,
      distance: Math.round(p.distanceTo(player.entity.position) * 10) / 10
    }));
  const nearbyEntities = Object.values(bot.entities)
    .filter(entity => entity !== bot.entity && entity.position && p.distanceTo(entity.position) < 12)
    .slice(0, 12)
    .map(entity => ({
      type: entity.name || entity.type,
      distance: Math.round(p.distanceTo(entity.position) * 10) / 10
    }));
  return {
    edition: 'java',
    position: { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) },
    dimension: bot.game?.dimension || 'unknown',
    health: bot.health,
    food: bot.food,
    timeOfDay: bot.time?.timeOfDay,
    weather: bot.isRaining ? 'rain' : 'clear',
    nearbyPlayers,
    nearbyEntities
  };
}

async function sendHeartbeat() {
  if (!bot?.entity) return;
  try {
    const state = snapshot();
    await axios.post(heartbeatUrl, {
      connected: true,
      position: state.position,
      health: state.health,
      food: state.food,
      dimension: state.dimension,
      players: (state.nearbyPlayers || []).map(player => player.name),
      nearby_entities: state.nearbyEntities || [],
      time_of_day: state.timeOfDay,
      weather: state.weather
    }, { timeout: 5000 });
  } catch (error) {
    console.error('Heartbeat failed:', error.message);
  }
}

function setNavigation(target) {
  const movements = new Movements(bot);
  movements.canDig = false;
  movements.allow1by1towers = false;
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.setGoal(target, true);
}

function follow(sender) {
  if (!isOwner(sender)) return say('Movement commands are owner-only.');
  const target = bot.players[sender]?.entity;
  if (!target) return say(sender + ': I cannot see you right now.');
  setNavigation(new goals.GoalFollow(target, 2));
  say('Okay ' + sender + ', I am following you.');
}

function come(sender) {
  if (!isOwner(sender)) return say('Movement commands are owner-only.');
  const target = bot.players[sender]?.entity;
  if (!target) return say(sender + ': I cannot find you right now.');
  setNavigation(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2));
  say('Coming to you.');
}

function stop(sender) {
  if (!isOwner(sender)) return say('Only my owner can stop my movement.');
  bot.pathfinder.setGoal(null);
  say('Stopped. I will stay here.');
}

async function applyAction(action, sender, autonomousCall = false) {
  const type = action?.type;
  if (!allowedActions.has(type) || type === 'none') return;
  if (autonomousCall && !['follow', 'look'].includes(type)) return;
  if (!autonomousCall && !isOwner(sender)) return;
  if (type === 'follow') return follow(sender || ownerName);
  if (type === 'come') return come(sender || ownerName);
  if (type === 'stop') return stop(sender || ownerName);
  if (type === 'look') {
    const target = bot.players[sender || ownerName]?.entity;
    if (target) await bot.lookAt(target.position.offset(0, 1.4, 0), true);
  }
}

async function askAI(sender, prompt) {
  say('Soch raha hoon...');
  try {
    const response = await axios.post(aiUrl, {
      player: sender,
      message: prompt,
      world: snapshot(),
      remember: true
    }, { timeout: 65000 });
    const data = response.data || {};
    const reply = data.reply || 'Mujhe abhi jawab nahi mila.';
    if (data.action?.type && data.action.type !== 'none') {
      await applyAction(data.action, sender, false);
    }
    say(reply);
  } catch (error) {
    console.error('AI request failed:', error.message);
    say('AI brain abhi unavailable hai. Python AI server check karo.');
  }
}

async function autonomousThink() {
  if (!autonomous || thinking || !bot?.entity || !ownerName) return;
  thinking = true;
  try {
    const response = await axios.post(thinkUrl, {
      player: ownerName,
      world: snapshot()
    }, { timeout: 65000 });
    const action = response.data?.action;
    if (action?.type && action.type !== 'none' && action.type !== lastAutoAction) {
      await applyAction(action, ownerName, true);
      lastAutoAction = action.type;
    } else if (action?.type === 'none') {
      lastAutoAction = 'none';
    }
  } catch (error) {
    console.error('Autonomous thought failed:', error.message);
  } finally {
    thinking = false;
  }
}

function createBot() {
  bot = mineflayer.createBot({ host, port, username, auth, version });
  bot.loadPlugin(pathfinder);
  bot.once('spawn', () => {
    console.log('Champu joined ' + host + ':' + port + ' as ' + username);
    say('Champu AI online! !champu <message> | !follow | !come | !stop | !status');
    if (thinkTimer) clearInterval(thinkTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(sendHeartbeat, 5000);
    sendHeartbeat();
    thinkTimer = setInterval(autonomousThink, thinkInterval);
  });
  bot.on('chat', async (sender, message) => {
    if (sender === bot.username) return;
    const command = message.trim();
    if (command === '!come') return come(sender);
    if (command === '!stop') return stop(sender);
    if (command === '!follow') return follow(sender);
    if (command === '!status') {
      const state = snapshot();
      return say('HP ' + state.health + ', food ' + state.food + ', at ' +
        state.position.x + ', ' + state.position.y + ', ' + state.position.z);
    }
    if (command === '!champu') return say('Use !champu <your message>.');
    if (!command.toLowerCase().startsWith('!champu ')) return;
    if (!isOwner(sender)) return say(sender + ': only my configured owner can use AI commands.');
    const prompt = command.slice('!champu '.length).trim();
    if (prompt) await askAI(sender, prompt);
  });
  bot.on('kicked', reason => console.error('Kicked:', reason));
  bot.on('error', error => console.error('Minecraft error:', error.message));
  bot.on('end', () => {
    if (thinkTimer) clearInterval(thinkTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.log('Disconnected; retrying in 8 seconds...');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(createBot, 8000);
  });
}

createBot();
