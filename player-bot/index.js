import mineflayer from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import axios from 'axios';

const env = (key, fallback = '') => process.env[key] || fallback;
const host = env('MC_HOST', '127.0.0.1');
const port = Number(env('MC_PORT', '25565'));
const username = env('MC_USERNAME', 'ChampuBot');
const auth = env('MC_AUTH', 'offline');
const version = env('MC_VERSION', '1.21.1');
const aiUrl = env('AI_URL', 'http://127.0.0.1:8000/chat');
const ownerName = env('OWNER_NAME');

let bot;
const history = [];

function say(message) {
  if (bot?.entity) bot.chat(String(message).slice(0, 240));
}

function createBot() {
  bot = mineflayer.createBot({ host, port, username, auth, version });
  bot.loadPlugin(pathfinder);
  bot.once('spawn', () => {
    console.log('Champu joined ' + host + ':' + port + ' as ' + username);
    say('Champu Bot online! Type !champu <message>');
  });
  bot.on('chat', async (sender, message) => {
    if (sender === bot.username) return;
    const command = message.trim();
    if (command === '!come') return come(sender);
    if (command === '!stop') return stopFollowing(sender);
    if (command === '!follow') return follow(sender);
    if (command === '!status') return say('Online at ' + Math.round(bot.entity.position.x) + ', ' + Math.round(bot.entity.position.y) + ', ' + Math.round(bot.entity.position.z));
    if (!command.toLowerCase().startsWith('!champu ')) return;
    if (ownerName && sender !== ownerName) return say(sender + ': owner permission required.');
    const prompt = command.slice('!champu '.length).trim();
    if (prompt) await askAI(sender, prompt);
  });
  bot.on('kicked', reason => console.error('Kicked:', reason));
  bot.on('error', error => console.error('Minecraft error:', error.message));
  bot.on('end', () => {
    console.log('Disconnected; reconnecting in 5 seconds...');
    setTimeout(createBot, 5000);
  });
}

function playerEntity(name) {
  return bot.players[name]?.entity;
}

function follow(sender) {
  const target = playerEntity(sender);
  if (!target) return say(sender + ': I cannot see you yet.');
  const movements = new Movements(bot);
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
  say('Following ' + sender + '.');
}

function come(sender) {
  const target = playerEntity(sender);
  if (!target) return say(sender + ': I cannot find you.');
  const movements = new Movements(bot);
  bot.pathfinder.setMovements(movements);
  bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2));
  say('Coming to ' + sender + '.');
}

function stopFollowing(sender) {
  if (ownerName && sender !== ownerName) return say(sender + ': owner permission required.');
  bot.pathfinder.setGoal(null);
  say('Stopped.');
}

async function askAI(sender, prompt) {
  say('Thinking...');
  try {
    const response = await axios.post(aiUrl, { player: sender, message: prompt, history }, { timeout: 45000 });
    const reply = response.data?.reply || 'I have no answer yet.';
    history.push({ role: 'user', content: sender + ': ' + prompt });
    history.push({ role: 'assistant', content: reply });
    while (history.length > 12) history.shift();
    say(sender + ': ' + reply);
  } catch (error) {
    console.error('AI request failed:', error.message);
    say('AI server offline hai. Python service aur Ollama start karo.');
  }
}

createBot();

