const {SlashCommandBuilder,ChannelType,ActionRowBuilder,ButtonBuilder,ButtonStyle}=require('discord.js');
const db=require('../../database/db');
const eco=require('../../services/economy');
const arts=require('../../services/artifacts');
const {economyEmbed,COLORS,rarityColor,rarityEmoji,rarityLabel,divider}=require('../../utils/economyTheme');
module.exports={
 data:new SlashCommandBuilder().setName('market').setDescription('Spider-Verse artifact marketplace')
 .addSubcommand(s=>s.setName('list').setDescription('List an artifact for Power Tokens').addIntegerOption(o=>o.setName('artifact_id').setRequired(true).setDescription('Owned artifact ID')).addIntegerOption(o=>o.setName('price').setRequired(true).setMinValue(1).setDescription('Price')).addChannelOption(o=>o.setName('channel').addChannelTypes(ChannelType.GuildText).setDescription('Marketplace channel')))
 .addSubcommand(s=>s.setName('browse').setDescription('Browse active listings'))
 .addSubcommand(s=>s.setName('cancel').setDescription('Cancel your listing').addIntegerOption(o=>o.setName('listing_id').setRequired(true).setDescription('Listing ID'))),
 async execute(i){const s=i.options.getSubcommand(),g=i.guild.id;
  if(s==='list'){
   const id=i.options.getInteger('artifact_id'),a=arts.artifact(id);
   if(!a||a.owner_id!==i.user.id)return i.reply({content:'❌ You do not own that artifact.',ephemeral:true});
   if(a.locked_trade_id)return i.reply({content:'❌ That artifact is locked in a trade.',ephemeral:true});
   if(db.prepare(`SELECT 1 FROM marketplace_listings WHERE artifact_id=? AND status='active'`).get(id))return i.reply({content:'❌ Already listed.',ephemeral:true});
   const c=i.options.getChannel('channel')||i.channel,p=i.options.getInteger('price');
   const r=db.prepare(`INSERT INTO marketplace_listings(guild_id,artifact_id,seller_id,price,channel_id,created_at) VALUES(?,?,?,?,?,?)`).run(g,id,i.user.id,p,c.id,Date.now()),lid=r.lastInsertRowid;
   const e=economyEmbed(`${rarityEmoji(a.rarity)} ${arts.label(a)}`,`${divider()}\n**${rarityLabel(a.rarity)}** • ${a.collection_name}\n\n🕸️ **Passive**\n> ${a.passive||'Cosmetic collectible'}\n\n👤 **Seller:** ${i.user}\n💠 **Price:** ${p} Power Tokens\n🔢 **Listing:** #${lid}\n${divider()}`,rarityColor(a.rarity));
   const m=await c.send({embeds:[e],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`econ_marketbuy:${lid}`).setLabel(`Cross Dimensions • ${p} PT`).setEmoji('🕷️').setStyle(ButtonStyle.Success))]});
   db.prepare('UPDATE marketplace_listings SET message_id=? WHERE id=?').run(m.id,lid);
   return i.reply({embeds:[economyEmbed('✅ Portal Listing Opened',`**${arts.label(a)}** is now available in ${c}.`,COLORS.neonCyan)],ephemeral:true});
  }
  if(s==='browse'){
   const rows=db.prepare(`SELECT l.*,a.copy_number,t.name,t.collection_name,t.rarity FROM marketplace_listings l JOIN artifacts a ON a.id=l.artifact_id JOIN artifact_types t ON t.id=a.type_id WHERE l.guild_id=? AND l.status='active' ORDER BY l.created_at DESC LIMIT 20`).all(g);
   return i.reply({embeds:[economyEmbed('🌐 MULTIVERSE MARKETPLACE',rows.length?`${divider()}\n${rows.map(x=>`${rarityEmoji(x.rarity)} **${x.name} #${String(x.copy_number).padStart(3,'0')}** • ${rarityLabel(x.rarity)}\n💠 ${x.price} PT • Seller <@${x.seller_id}> • Listing #${x.id}`).join(`\n\n${divider()}\n`)}`:'No active portals are open right now.',COLORS.neonCyan)]});
  }
  const l=db.prepare(`SELECT * FROM marketplace_listings WHERE id=? AND guild_id=? AND status='active'`).get(i.options.getInteger('listing_id'),g);
  if(!l||l.seller_id!==i.user.id&&!eco.isOwner(i))return i.reply({content:'❌ Listing not found or not yours.',ephemeral:true});
  db.prepare(`UPDATE marketplace_listings SET status='cancelled' WHERE id=?`).run(l.id);
  if(l.channel_id&&l.message_id){const c=i.guild.channels.cache.get(l.channel_id),m=await c?.messages.fetch(l.message_id).catch(()=>null);await m?.edit({components:[]}).catch(()=>{})}
  return i.reply({embeds:[economyEmbed('🕸️ Portal Closed',`Marketplace listing **#${l.id}** was cancelled.`,COLORS.spiderRed)],ephemeral:true});
 }};
