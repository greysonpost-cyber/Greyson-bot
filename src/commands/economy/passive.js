const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database/db');
const eco = require('../../services/economy');
const arts = require('../../services/artifacts');
const { economyEmbed, COLORS, divider } = require('../../utils/economyTheme');

const DAY = 86_400_000;
function cooldown(guildId, userId, key) {
  return db.prepare('SELECT last_used_at FROM artifact_passive_cooldowns WHERE guild_id=? AND user_id=? AND passive_key=?').get(guildId,userId,key)?.last_used_at || 0;
}
function mark(guildId, userId, key, now=Date.now()) {
  db.prepare(`INSERT INTO artifact_passive_cooldowns(guild_id,user_id,passive_key,last_used_at) VALUES(?,?,?,?)
    ON CONFLICT(guild_id,user_id,passive_key) DO UPDATE SET last_used_at=excluded.last_used_at`).run(guildId,userId,key,now);
}
function nextText(last) { return last && Date.now()-last<DAY ? `<t:${Math.floor((last+DAY)/1000)}:R>` : '**READY NOW**'; }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('passive')
    .setDescription('Activate and check Spider-Verse artifact passives')
    .addSubcommand(s=>s.setName('spider-man').setDescription('Use Spider-Man for +1 entry on a giveaway you choose')
      .addIntegerOption(o=>o.setName('giveaway_id').setDescription('Giveaway ID').setRequired(true)))
    .addSubcommand(s=>s.setName('web-swing').setDescription('Claim Web Swing\'s free Power Token'))
    .addSubcommand(s=>s.setName('web-slinger').setDescription('Privately claim the Web Slinger passive'))
    .addSubcommand(s=>s.setName('status').setDescription('View your Spider-Verse passive status')),

  async execute(i, client) {
    const sub=i.options.getSubcommand(), g=i.guild.id, u=i.user.id, now=Date.now();
    if(sub==='spider-man'){
      if(!arts.ownsNamed(g,u,'Spider-Man')) return i.reply({embeds:[economyEmbed('🕷️ Artifact Required','You must own **Spider-Man** to activate this power.',COLORS.spiderRed)],ephemeral:true});
      const last=cooldown(g,u,'spider_man');
      if(now-last<DAY) return i.reply({embeds:[economyEmbed('🕸️ Spider-Sense Recharging',`Your next Spider-Man boost is ready ${nextText(last)}.`,COLORS.spiderRed)],ephemeral:true});
      const id=i.options.getInteger('giveaway_id');
      const giveaway=db.prepare('SELECT * FROM giveaways WHERE id=? AND guild_id=?').get(id,g);
      if(!giveaway) return i.reply({embeds:[economyEmbed('❌ Giveaway Not Found',`Giveaway **#${id}** does not exist in this server.`,COLORS.spiderRed)],ephemeral:true});
      if(giveaway.ended||giveaway.locked) return i.reply({embeds:[economyEmbed('❌ Cannot Activate',giveaway.ended?'That giveaway has ended.':'That giveaway is locked.',COLORS.spiderRed)],ephemeral:true});
      const entry=db.prepare('SELECT * FROM giveaway_entries WHERE giveaway_id=? AND user_id=?').get(id,u);
      if(!entry) return i.reply({embeds:[economyEmbed('❌ Enter First','Enter that giveaway normally before activating Spider-Man.',COLORS.spiderRed)],ephemeral:true});
      db.transaction(()=>{
        db.prepare('UPDATE giveaway_entries SET entries=entries+1 WHERE giveaway_id=? AND user_id=?').run(id,u);
        mark(g,u,'spider_man',now);
      })();
      const gh=require('../../handlers/giveawayHandler');
      await gh.refreshGiveawayMessage(client,giveaway).catch(()=>{});
      return i.reply({embeds:[economyEmbed('🕷️ Spider-Man Activated!',`${divider()}\nGiveaway **#${id} — ${giveaway.prize}** received **+1 bonus entry**.\n\nThis power can be used again <t:${Math.floor((now+DAY)/1000)}:R>.`,COLORS.spiderRed)],ephemeral:true});
    }
    if(sub==='web-swing' || sub==='web-slinger'){
      if(!arts.ownsNamed(g,u,'Web Swing') && !arts.ownsNamed(g,u,'Web Slinger')) return i.reply({embeds:[economyEmbed('🌟 Artifact Required','You must own **Web Swing / Web Slinger** to claim this power.',COLORS.legendary)],ephemeral:true});
      const last=cooldown(g,u,'web_swing');
      if(now-last<DAY) return i.reply({embeds:[economyEmbed('🕸️ Web Shooters Recharging',`Your next free Power Token is ready ${nextText(last)}.`,COLORS.legendary)],ephemeral:true});
      db.transaction(()=>{ eco.add(g,u,1,'Web Swing passive','SYSTEM'); mark(g,u,'web_swing',now); })();
      return i.reply({embeds:[economyEmbed('🌟 Web Swing Activated!',`${divider()}\nYou swung across the multiverse and collected **+1 Power Token**.\n\n**Balance:** ${eco.bal(g,u)} PT\n**Next claim:** <t:${Math.floor((now+DAY)/1000)}:R>`,COLORS.legendary)],ephemeral:true});
    }
    const day=eco.dayKey();
    const friendlyUses=db.prepare('SELECT uses FROM artifact_passive_daily_usage WHERE guild_id=? AND user_id=? AND passive_key=? AND day_key=?').get(g,u,'friendly_refund',day)?.uses||0;
    const owned=[arts.ownsNamed(g,u,'Spider-Man'),arts.ownsNamed(g,u,'Web Swing'),arts.ownsNamed(g,u,'Friendly Neighborhood')];
    return i.reply({embeds:[economyEmbed('🕷️ Your Spider-Verse Powers',`${divider()}\n🕷️ **Spider-Man** ${owned[0]?'✅ Owned':'🔒 Not owned'}\nNext +1 giveaway entry: ${owned[0]?nextText(cooldown(g,u,'spider_man')):'—'}\n\n🌟 **Web Swing** ${owned[1]?'✅ Owned':'🔒 Not owned'}\nNext free PT: ${owned[1]?nextText(cooldown(g,u,'web_swing')):'—'}\n\n🌀 **Friendly Neighborhood** ${owned[2]?'✅ Owned':'🔒 Not owned'}\nRefunds today: **${friendlyUses}/2**\n${divider()}`,COLORS.secret)],ephemeral:true});
  }
};
