import mineflayer from 'mineflayer';
import pathfinderPackage from 'mineflayer-pathfinder';
import { loadConfig } from '../config/load.js';
import { LLMClient } from '../brain/llm/client.js';
import { Brain } from '../brain/index.js';

const { pathfinder, Movements, goals } = pathfinderPackage;
const cfg = loadConfig();
const ownerName = cfg.owners[0] || process.env.OWNER_NAME || '';
let bot;
let brain;
const heard = [];

const say = (text) => {
  const line = String(text || '').replace(/[\r\n]/g, ' ').slice(0, 240);
  if (line && bot?.entity) bot.chat(line);
};

function playerEntities() {
  return Object.values(bot?.players || {}).filter((p) => p.entity && p.username !== bot.username);
}

function nearestPlayer() {
  const p = bot.entity?.position;
  return playerEntities().sort((a, b) => p.distanceTo(a.entity.position) - p.distanceTo(b.entity.position))[0];
}

function configureMovements() {
  const movements = new Movements(bot);
  movements.canDig = false;
  movements.allow1by1towers = false;
  bot.pathfinder.setMovements(movements);
}

function positionTarget(target) {
  return target?.pos || target?.position || target;
}

async function goNear(pos, distance = 2) {
  if (!pos) return { ok: false, outcome: 'No target position.' };
  await bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, distance));
  return { ok: true, outcome: 'Reached target.' };
}

function sense() {
  if (!bot?.entity) return {};
  const p = bot.entity.position;
  const hostile = new Set(['zombie', 'skeleton', 'spider', 'creeper', 'witch', 'enderman']);
  const entities = Object.values(bot.entities)
    .filter((e) => e !== bot.entity && e.position && p.distanceTo(e.position) <= 12)
    .slice(0, 16)
    .map((e) => ({
      kind: e.username ? 'human' : (e.name && hostile.has(e.name) ? 'creature' : 'item'),
      name: e.username || e.name || e.type || 'thing',
      dist: p.distanceTo(e.position),
      dy: e.position.y - p.y,
      pos: { x: e.position.x, y: e.position.y, z: e.position.z }
    }));
  const positions = bot.findBlocks({
    matching: (block) => block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air',
    maxDistance: 8,
    count: 24
  });
  const blocks = positions.map((pos) => {
    const block = bot.blockAt(pos);
    return { name: block?.name || 'unknown', dist: p.distanceTo(pos), dy: pos.y - p.y, pos: { x: pos.x, y: pos.y, z: pos.z } };
  });
  const inventory = bot.inventory.items().slice(0, 12).map((item) => ({ name: item.name, count: item.count }));
  const isNight = typeof bot.time?.timeOfDay === 'number' && bot.time.timeOfDay > 13000;
  const nextHeard = heard.splice(0, 12);
  return {
    health: bot.health, food: bot.food, isNight, raining: bot.isRaining,
    damageTaken: false, inventory, entities, blocks, heard: nextHeard,
    position: { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) }
  };
}

async function act({ name, args = {}, target }) {
  if (!bot?.entity) return { ok: false, outcome: 'Bot is not spawned.' };
  const pos = positionTarget(target);
  if (name === 'rest') return { ok: true, outcome: 'Stayed still.' };
  if (name === 'look_around') {
    await bot.look(Math.random() * Math.PI * 2 - Math.PI, 0, true);
    return { ok: true, outcome: 'Looked around.' };
  }
  if (name === 'follow_voice') {
    const player = ownerName ? bot.players[ownerName] : nearestPlayer();
    if (!player?.entity) return { ok: false, outcome: 'No nearby player to follow.' };
    bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true);
    return { ok: true, outcome: 'Following the nearby player.' };
  }
  if (name === 'walk_to' || name === 'touch') return goNear(pos);
  if (name === 'flee') {
    bot.pathfinder.setGoal(null);
    bot.setControlState('sprint', true);
    bot.setControlState('forward', true);
    setTimeout(() => bot?.entity && bot.clearControlStates(), 2500);
    return { ok: true, outcome: 'Moved away from danger.' };
  }
  if (name === 'pick_up') return goNear(pos, 1);
  if (name === 'break_off') {
    await goNear(pos, 3);
    const block = bot.blockAt(pos);
    if (!block || block.name === 'air') return { ok: false, outcome: 'Target block is gone.' };
    await bot.dig(block, true);
    return { ok: true, outcome: 'Broke ' + block.name + '.' };
  }
  if (name === 'eat') {
    const food = bot.inventory.items().find((item) => /bread|apple|cooked_|carrot|potato|melon|berries|cookie|pie/.test(item.name));
    if (!food) return { ok: false, outcome: 'No food in inventory.' };
    await bot.equip(food, 'hand');
    await bot.consume();
    return { ok: true, outcome: 'Ate ' + food.name + '.' };
  }
  if (name === 'sleep') {
    const beds = bot.findBlocks({ matching: (block) => block?.name?.endsWith('_bed'), maxDistance: 16, count: 1 });
    if (!beds.length) return { ok: false, outcome: 'No bed nearby.' };
    await goNear(beds[0], 2);
    await bot.sleep(bot.blockAt(beds[0]));
    return { ok: true, outcome: 'Went to sleep.' };
  }
  return { ok: true, outcome: 'Action not implemented yet: ' + name };
}

function start() {
  bot = mineflayer.createBot({
    host: cfg.minecraft.host,
    port: cfg.minecraft.port,
    username: cfg.minecraft.username,
    version: cfg.minecraft.version,
    auth: cfg.minecraft.auth
  });
  bot.loadPlugin(pathfinder);
  bot.once('spawn', async () => {
    configureMovements();
    brain = new Brain({
      config: cfg,
      llm: new LLMClient(cfg, { logFile: 'data/llm.log' }),
      body: { sense, act, say }
    });
    await brain.init();
    brain.on('thought', (event) => console.log('[thought]', JSON.stringify(event)));
    brain.on('learned', (event) => console.log('[learned]', JSON.stringify(event)));
    brain.on('error', (error) => console.error('[brain]', error));
    brain.start();
    say('Champu brain online. I am watching, learning, and thinking.');
  });
  bot.on('chat', (sender, message) => {
    if (sender === bot.username) return;
    heard.push({ speaker: sender, text: message });
  });
  bot.on('error', (error) => console.error('[minecraft]', error.message));
  bot.on('kicked', (reason) => console.error('[kicked]', reason));
  bot.on('end', () => {
    brain?.shutdown().catch(() => {});
    console.log('Disconnected; restart the process to reconnect.');
  });
}

start();
