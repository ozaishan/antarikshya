require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const NASA_API_KEY = process.env.NASA_API_KEY;
const CONFIG_FILE = './serverConfig.json';

// Load per-server channel config
let serverChannels = {};
if (fs.existsSync(CONFIG_FILE)) {
  try {
    serverChannels = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (err) {
    console.error('Error reading serverConfig.json:', err);
    serverChannels = {};
  }
}

function saveServerConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(serverChannels, null, 2));
}

// Get random date within last 3 years in YYYY-MM-DD
function getRandomDateLast3Years() {
  const now = Date.now();
  const threeYearsInMs = 3 * 365 * 24 * 60 * 60 * 1000;
  const randomPastTime = now - Math.floor(Math.random() * threeYearsInMs);
  return new Date(randomPastTime).toISOString().split('T')[0];
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function sendApodMessage(channel, apod) {
  const embed = new EmbedBuilder()
    .setTitle(`NASA Astronomy Picture of the Day - ${apod.date}`)
    .setDescription(apod.explanation)
    .setFooter({ text: `© NASA | Media Type: ${apod.media_type}` });

  if (apod.url && apod.url.startsWith('http')) {
    embed.setURL(apod.url);
  }

  if (apod.media_type === 'image') {
    const imageUrl = apod.hdurl && apod.hdurl.startsWith('http') ? apod.hdurl : apod.url;
    embed.setImage(imageUrl);
    await channel.send({ embeds: [embed] });

  } else if (apod.media_type === 'video') {
    await channel.send({ embeds: [embed] });
    await channel.send(apod.url);

  } else {
    await channel.send({ embeds: [embed] });
  }
}

// NASA API fetch functions
async function fetchAPOD(date = '') {
  try {
    let url = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`;
    if (date) url += `&date=${date}`;
    const res = await axios.get(url);
    return res.data;
  } catch (error) {
    console.error('Error fetching APOD:', error);
    return null;
  }
}

async function fetchMarsPhotos(date = '') {
  try {
    let url = `https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos?api_key=${NASA_API_KEY}`;
    url += date ? `&earth_date=${date}` : '&earth_date=latest';
    const res = await axios.get(url);
    return res.data.photos;
  } catch (error) {
    console.error('Error fetching Mars photos:', error);
    return [];
  }
}

async function fetchEarthImages(query = 'earth') {
  try {
    const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`;
    const res = await axios.get(url);
    const items = res.data.collection.items || [];
    return items;
  } catch (error) {
    console.error('Error fetching Earth images:', error);
    return [];
  }
}

async function fetchSpaceWeather() {
  try {
    const url = `https://api.nasa.gov/DONKI/FLR?api_key=${NASA_API_KEY}`;
    const res = await axios.get(url);
    return res.data;
  } catch (error) {
    console.error('Error fetching Space Weather:', error);
    return [];
  }
}

async function fetchFact() {
  try {
    const res = await axios.get('http://numbersapi.com/random/date');
    return res.data;
  } catch {
    return null;
  }
}

// Bot ready event
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);

  client.user.setPresence({
    activities: [{ name: 'Exploring Space! 🚀', type: 0 }],
    status: 'online',
  });

 // Daily APOD post at 5:55 PM NPT (12:10 PM UTC)
cron.schedule('10 12 * * *', async () => {
  console.log('📅 Running daily APOD post (5:55 PM NPT)...');
  for (const guildId in serverChannels) {
    try {
      const channelId = serverChannels[guildId];
      const channel = await client.channels.fetch(channelId);
      if (!channel) continue;

      const apod = await fetchAPOD();
      if (!apod) continue;

      await sendApodMessage(channel, apod);
    } catch (error) {
      console.error(`Error posting APOD for guild ${guildId}:`, error);
    }
  }
});

});

// Command handler
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

if (command === 'help') {
  const helpEmbed = new EmbedBuilder()
    .setTitle('🚀 NASA Bot Commands')
    .setDescription(`
**!help** - Show this help message
**!apod [YYYY-MM-DD]** - Astronomy Picture of the Day (random date from last 3 years if no date)
**!mars [YYYY-MM-DD]** - Mars Rover Photos (random date from last 3 years if no date)
**!earth [search terms]** - NASA Image Library Search (returns up to 3 images for query, defaults to "earth")
**!nasa random** - Random APOD from last 3 years
**!trivia** - Random space-related fact
**!spaceweather** - Latest solar flare alert
**!setchannel** - Set this channel for daily APOD posts (Admin only)
    `)
    .setFooter({ text: 'Data provided by NASA APIs' });

  return message.channel.send({ embeds: [helpEmbed] });
}


  if (command === 'setchannel') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply("❌ You don't have permission to set the channel.");
    }
    serverChannels[message.guild.id] = message.channel.id;
    saveServerConfig();
    return message.reply(`✅ This channel has been set for daily APOD posts.`);
  }

  if (command === 'apod') {
    const date = args[0] || getRandomDateLast3Years();
    const apod = await fetchAPOD(date);
    if (!apod) return message.reply("Couldn't fetch APOD right now.");

    await sendApodMessage(message.channel, apod);
    return;
  }

  if (command === 'mars') {
    const date = args[0] || getRandomDateLast3Years();
    const photos = await fetchMarsPhotos(date);
    if (!photos.length) return message.reply("No Mars photos found for that date.");

    const limitedPhotos = photos.slice(0, 3);
    for (const photo of limitedPhotos) {
      const embed = new EmbedBuilder()
        .setTitle(`Mars Rover Photo - ${photo.earth_date}`)
        .setImage(photo.img_src)
        .setFooter({ text: `Camera: ${photo.camera.full_name} | Rover: ${photo.rover.name}` });
      await message.channel.send({ embeds: [embed] });
    }
    return;
  }



if (command === 'earth') {
  const query = args.length > 0 ? args.join(' ') : 'earth';

  const items = await fetchEarthImages(query);
  if (items.length === 0) {
    return message.reply(`No images found for "${query}".`);
  }

  const limitedItems = items.slice(0, 3);
  for (const item of limitedItems) {
    const imageLink = item.links?.find(link => link.rel === 'preview')?.href;
    const data = item.data?.[0];
    const title = data?.title || 'NASA Image';
    const description = data?.description || 'No description available';

    if (!imageLink) continue;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description.length > 2048 ? description.slice(0, 2045) + '...' : description)
      .setImage(imageLink)
      .setFooter({ text: 'Source: images-api.nasa.gov' });

    await message.channel.send({ embeds: [embed] });
  }
  return;
}
  if (command === 'nasa' && args[0] === 'random') {
    const randomDate = getRandomDateLast3Years();
    const apod = await fetchAPOD(randomDate);
    if (!apod) return message.reply("Couldn't fetch random NASA image.");

    return sendApodMessage(message.channel, apod);
  }

  if (command === 'trivia') {
    const fact = await fetchFact();
    if (!fact) return message.reply("Couldn't fetch a fact right now.");
    return message.channel.send(`🪐 **Space Trivia:** ${fact}`);
  }

  if (command === 'spaceweather') {
    const events = await fetchSpaceWeather();
    if (!events.length) return message.reply("No recent space weather events found.");

    const latestEvent = events[0];
    const embed = new EmbedBuilder()
      .setTitle(`Space Weather Alert: Solar Flare`)
      .setDescription(`Class: ${latestEvent.classType}\nStart: ${latestEvent.beginTime}\nPeak: ${latestEvent.peakTime}\nSource: ${latestEvent.sourceLocation}`)
      .setFooter({ text: "Data from NASA DONKI API" });

    return message.channel.send({ embeds: [embed] });
  }

  return message.reply("Unknown command! Use `!help` to see all commands.");
});

client.login(DISCORD_TOKEN);
