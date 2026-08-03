const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');

const active = new Set();
const COLORS = [0xE11D2E, 0x0A4DFF, 0x6A00FF, 0xFF2D95, 0x22D3EE, 0xFFD54A];
const COLLECTION_COLORS = [0xD0002A, 0x6A00FF, 0x00D4FF, 0xFF2D95, 0xFFD54A];
const PRISMATIC_COLORS = [0xFF1744, 0xFF8C00, 0xFFD700, 0x00E676, 0x00B0FF, 0x7C4DFF, 0xFF2D95];

const normalLines = [
  name => `🕸️ Webs snap across the room as **${name}** arrives!`,
  name => `⚡ A limited-role holder, **${name}**, just entered the action!`,
  name => `💥 **${name}** crashes through the multiverse in style!`,
  name => `🌠 A rare portal opens—**${name}** has appeared!`,
  name => `🕷️ Spider-sense activated: **${name}** joined!`,
  name => `✨ The arena lights bend around **${name}**!`,
  name => `🎭 A special-role entrance has begun for **${name}**!`,
  name => `🚨 Dimensional signature detected: **${name}**!`,
];

const prismaticLines = [
  name => `🌈 **PRISMATIC ARTIFACT DETECTED**
The one-of-one Punisher fractures reality as **${name}** arrives!`,
  name => `⚠️ **THE PUNISHER HAS ENTERED**
Every universe locks onto **${name}**. Only one copy exists.`,
  name => `💀 **ONE-OF-ONE SIGNATURE**
A prismatic shockwave announces **${name}**!`,
  name => `🌀 **MULTIVERSE OVERRIDE**
The timeline bends around The Punisher's owner, **${name}**!`,
  name => `🌈 **PRISMATIC DOMINANCE**
Seven colors tear across the arena as **${name}** appears!`,
];

const collectionLines = [
  name => `🌌 **THE SPIDER-VERSE OPENS**\nA portal tears through reality as **${name}** swings in from another universe!`,
  name => `🕷️ **COLLECTION COMPLETE • MULTIVERSE ENTRY**\nEvery Spider-Verse signal activates for **${name}**!`,
  name => `⚡ **REALITY GLITCH DETECTED**\n████ ${name} ████ has entered the timeline.`,
  name => `🕸️ **THE ENTIRE COLLECTION RESPONDS**\nRed, blue, gold, and violet energy surround **${name}**!`,
  name => `💫 **CANON EVENT ARRIVAL**\nThe arena rewrites itself around **${name}**!`,
  name => `🌠 **ULTRA-RARE ENTRANCE**\nA completed collection opens every portal for **${name}**!`,
  name => `🌀 **MULTIVERSAL COLLISION**\nSeveral universes overlap as **${name}** appears!`,
  name => `👑 **SPIDER-VERSE COLLECTOR**\nThe rarest entrance belongs to **${name}**!`,
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function contextLabel(context) {
  return ({ giveaway: 'Giveaway Entry', tournament: 'Tournament Entry', minigame: 'Minigame Entry', general: 'General Chat Arrival' })[context] || 'Special Arrival';
}
function roleState(member) {
  if (!member?.guild) return null;
  // The Punisher always takes visual priority, even though it also grants the collection role.
  const punisher = db.prepare(`SELECT name,rarity,discord_role_id FROM artifact_types
    WHERE guild_id=? AND lower(name)=lower('The Punisher') AND discord_role_id IS NOT NULL LIMIT 1`).get(member.guild.id);
  if (punisher && member.roles.cache.has(punisher.discord_role_id)) {
    return { prismatic: true, collection: false, label: punisher.name, rarity: 'Prismatic', roleId: punisher.discord_role_id };
  }
  const collection = db.prepare('SELECT collection_name,role_id FROM collection_rewards WHERE guild_id=?').all(member.guild.id)
    .find(r => member.roles.cache.has(r.role_id));
  if (collection) return { collection: true, prismatic: false, label: collection.collection_name, roleId: collection.role_id };
  const artifact = db.prepare(`SELECT name,rarity,discord_role_id FROM artifact_types
    WHERE guild_id=? AND discord_role_id IS NOT NULL`).all(member.guild.id)
    .find(r => member.roles.cache.has(r.discord_role_id));
  if (!artifact) return null;
  return { collection: false, prismatic: false, label: artifact.name, rarity: artifact.rarity, roleId: artifact.discord_role_id };
}

async function trigger(channel, member, context, options = {}) {
  if (!channel?.isTextBased?.() || !member) return null;
  const state = roleState(member);
  if (!state) return null;
  const key = `${channel.id}:${member.id}:${context}`;
  if (active.has(key)) return null;
  active.add(key);
  const name = member.displayName || member.user?.username || 'A collector';
  const rareRoll = Math.random();
  const collection = state.collection;
  const prismatic = state.prismatic;
  const line = prismatic ? pick(prismaticLines)(name) : collection ? pick(collectionLines)(name) : pick(normalLines)(name);
  const rarity = prismatic
    ? (rareRoll < .05 ? '💥 PRISMATIC COLLAPSE • 5% VARIANT' : '🌈 ONE-OF-ONE PRISMATIC')
    : collection ? (rareRoll < .03 ? '🌟 MYTHIC 3% VARIANT' : rareRoll < .10 ? '✨ ULTRA-RARE VARIANT' : '🌌 COLLECTION EXCLUSIVE')
    : (rareRoll < .02 ? '💥 SECRET 2% VARIANT' : rareRoll < .08 ? '✨ RARE VARIANT' : '🎆 LIMITED COSMETIC');
  const palette = prismatic ? PRISMATIC_COLORS : collection ? COLLECTION_COLORS : COLORS;
  const embed = new EmbedBuilder()
    .setColor(palette[0])
    .setAuthor({ name: `DRIPCORE • ${contextLabel(context)}` })
    .setTitle(prismatic ? '🌈 THE PUNISHER • PRISMATIC EFFECT' : collection ? '🌌 SPIDER-VERSE COLLECTION EFFECT' : `🎇 ${state.label.toUpperCase()} EFFECT`)
    .setDescription(`━━━━━━━━━━━━━━━━━━━━\n${line}\n\n${rarity}\n━━━━━━━━━━━━━━━━━━━━`)
    .setFooter({ text: 'Special role cosmetic • vanishes in 15 seconds' })
    .setTimestamp();
  const msg = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
  if (!msg) { active.delete(key); return null; }
  let frame = 0;
  const timer = setInterval(async () => {
    frame += 1;
    embed.setColor(palette[frame % palette.length]);
    embed.setFooter({ text: `Dimensional effect active • ${Math.max(0, 15 - frame * 2)}s remaining` });
    await msg.edit({ embeds: [embed] }).catch(() => clearInterval(timer));
  }, 2000);
  timer.unref?.();
  setTimeout(async () => {
    clearInterval(timer);
    await msg.delete().catch(() => {});
    active.delete(key);
  }, options.durationMs || 15000).unref?.();
  return msg;
}

module.exports = { trigger, roleState };
