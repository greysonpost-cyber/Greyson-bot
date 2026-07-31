const { Events } = require('discord.js');
const { trigger, roleState } = require('../services/specialRoleEffects');
const { getConfig } = require('../utils/config');
const lastSeen = new Map();

function isGeneral(message) {
  const configured = getConfig(message.guild.id, 'general_channel');
  if (configured) return message.channel.id === configured;
  const name = String(message.channel.name || '').toLowerCase();
  return name === 'general' || name.includes('general-chat');
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot || !isGeneral(message)) return;
    if (!roleState(message.member)) return;
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const previous = lastSeen.get(key) || 0;
    lastSeen.set(key, now);
    if (now - previous < 5 * 60_000) return;
    await trigger(message.channel, message.member, 'general');
  },
};
