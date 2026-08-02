const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const db = require('../database/db');
const { getConfig, setConfig } = require('../utils/config');
const { successEmbed, errorEmbed, infoEmbed } = require('../utils/embeds');
const eco = require('../services/economy');
const bracket = require('../services/bracketManager');

const GAMES = [
  '🔪 Murder Mystery 2',
  '👗 Dress to Impress',
  '📸 Best Screenshot',
  '🎭 Avatar Creator Challenge',
  '👑 Grand Finale',
];

const q = {
  active: db.prepare(`SELECT * FROM tournaments WHERE guild_id=? AND status!='deleted' ORDER BY id DESC LIMIT 1`),
  byId: db.prepare(`SELECT * FROM tournaments WHERE id=?`),
  players: db.prepare(`SELECT * FROM tournament_players WHERE tournament_id=? AND active=1 ORDER BY (contribution_points + round1_points + round2_points + round3_points + round4_points) DESC, joined_at ASC`),
  player: db.prepare(`SELECT * FROM tournament_players WHERE tournament_id=? AND user_id=?`),
  count: db.prepare(`SELECT COUNT(*) c FROM tournament_players WHERE tournament_id=? AND active=1`),
  roundState: db.prepare(`SELECT * FROM tournament_round_state WHERE tournament_id=? AND round_number=?`),
  dtiSubmissions: db.prepare(`SELECT * FROM tournament_submissions WHERE tournament_id=? AND round_number=2 ORDER BY submitted_at ASC, id ASC`),
  dtiSubmissionByNumber: db.prepare(`SELECT * FROM tournament_submissions WHERE tournament_id=? AND round_number=2 ORDER BY submitted_at ASC, id ASC LIMIT 1 OFFSET ?`),
  dtiSubmissionByUser: db.prepare(`SELECT * FROM tournament_submissions WHERE tournament_id=? AND round_number=2 AND user_id=?`),
  dtiVote: db.prepare(`SELECT * FROM tournament_votes WHERE tournament_id=? AND round_number=2 AND voter_id=?`),
};

const activeSubmissionCollectors = new Map();

const POWER_COSTS = { shield: 10, double_points: 5 };
function selectedPower(tournamentId, roundNumber, userId) {
  return db.prepare('SELECT * FROM tournament_round_powers WHERE tournament_id=? AND round_number=? AND user_id=?').get(tournamentId, roundNumber, userId);
}
function doubledPoints(t, userId, points) {
  const power = selectedPower(t.id, t.current_round, userId);
  return power?.power_key === 'double_points' ? points * 2 : points;
}
function consumeShield(tournamentId, roundNumber, userId) {
  const power = selectedPower(tournamentId, roundNumber, userId);
  if (power?.power_key !== 'shield' || power.consumed) return false;
  db.prepare('UPDATE tournament_round_powers SET consumed=1 WHERE tournament_id=? AND round_number=? AND user_id=?').run(tournamentId, roundNumber, userId);
  return true;
}
async function selectPower(interaction, t, choice) {
  if (t.status !== 'active' || t.current_round < 1 || t.current_round > 4) return interaction.reply({ content: '❌ Powers are available only during tournament rounds 1–4.', ephemeral: true });
  if (!t.power_selection_open || t.round_started) return interaction.reply({ content: '❌ Power selection is closed. Powers must be picked before the game starts.', ephemeral: true });
  const player = q.player.get(t.id, interaction.user.id);
  if (!player?.active) return interaction.reply({ content: '❌ Only active tournament participants can choose a power.', ephemeral: true });
  if (!POWER_COSTS[choice]) return interaction.reply({ content: '❌ Choose Shield or Double Points.', ephemeral: true });
  if (selectedPower(t.id, t.current_round, interaction.user.id)) return interaction.reply({ content: '❌ You already selected your one power for this round.', ephemeral: true });
  const cost = POWER_COSTS[choice];
  if (!eco.spend(interaction.guild.id, interaction.user.id, cost, `Tournament #${t.id} round ${t.current_round} ${choice}`, interaction.user.id)) {
    return interaction.reply({ content: `❌ **${choice === 'shield' ? 'Shield' : 'Double Points'}** costs **${cost} PT**. Your balance is **${eco.bal(interaction.guild.id, interaction.user.id)} PT**.`, ephemeral: true });
  }
  db.prepare(`INSERT INTO tournament_round_powers(tournament_id,guild_id,round_number,user_id,power_key,tokens_spent,consumed,selected_at) VALUES(?,?,?,?,?,?,0,?)`).run(t.id, interaction.guild.id, t.current_round, interaction.user.id, choice, cost, Date.now());
  const text = choice === 'shield' ? '🛡️ **Shield selected.** It blocks one elimination/removal during this round.' : '✖️ **Double Points selected.** Points awarded to you in this round are doubled.';
  return interaction.reply({ embeds: [successEmbed('Round Power Locked In', `${text}

Only you can see this confirmation. **${cost} PT** was spent.
Balance: **${eco.bal(interaction.guild.id, interaction.user.id)} PT**`)], ephemeral: true });
}

function score(p) {
  return Number(p.contribution_points || 0) + Number(p.token_bonus_points || 0) + Number(p.round1_points || 0) + Number(p.round2_points || 0) + Number(p.round3_points || 0) + Number(p.round4_points || 0);
}

function canManage(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.member.permissions.has(PermissionFlagsBits.Administrator) || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const roleId = getConfig(interaction.guild.id, 'tournament_manager_role');
  return Boolean(roleId && interaction.member.roles.cache.has(roleId));
}

function safeName(value) {
  return String(value || 'Player').replace(/[\r\n\t]/g, ' ').slice(0, 28);
}

function stageLabel(t) {
  if (t.status === 'registration') return 'Registration Open';
  if (t.status === 'finished') return 'Finished';
  if (t.power_selection_open && !t.round_started) return `Round ${t.current_round} Power Selection`;
  return `Round ${t.current_round}: ${GAMES[Math.max(0, t.current_round - 1)]}`;
}

function panelEmbed(t, players) {
  const medals = ['🥇', '🥈', '🥉'];
  const top = players.slice(0, 10).map((p, i) => `${medals[i] || `**${i + 1}.**`} <@${p.user_id}> — **${score(p)} pts**`).join('\n') || '🕸️ No challengers have entered the arena yet.';
  const games = GAMES.map((g, i) => `${t.current_round > i + 1 || t.status === 'finished' ? '✅' : t.current_round === i + 1 ? '🔥' : '▫️'} ${g}`).join('\n');
  const statusColor = t.status === 'finished' ? 0xF5B942 : t.status === 'registration' ? 0x1464F4 : 0x8B1CFB;
  const filled = Math.min(10, Math.round((players.length / Math.max(1, t.max_players)) * 10));
  const capacity = `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}  **${players.length}/${t.max_players}**`;
  return new EmbedBuilder()
    .setColor(statusColor)
    .setAuthor({ name: '🏆 DRIPCORE TOURNAMENTS • MULTIVERSE ARENA' })
    .setTitle(`🕷️ ${t.name}`)
    .setDescription(`━━━━━━━━━━━━━━━━━━━━
### ${stageLabel(t)}
🎁 **Grand Prize:** ${t.prize}
👥 **Arena Capacity:** ${capacity}
━━━━━━━━━━━━━━━━━━━━`)
    .addFields(
      { name: '🎮 MULTIVERSE ROUNDS', value: games, inline: true },
      { name: '📊 LIVE STANDINGS', value: top, inline: true },
      { name: '⚡ ROUND POWERS', value: t.status === 'active' && t.current_round <= 4 ? (t.power_selection_open && !t.round_started ? 'Choose **one** before the game starts:\n🛡️ Shield — **10 PT**\n✖️ Double Points — **5 PT**' : 'Power selection is locked for this round.') : 'Round powers appear during rounds 1–4.', inline: false },
      { name: '🏅 AUTOMATIC TOKEN PRIZES', value: '🥇 1st: **15 PT** • 🥈 2nd: **10 PT** • 🥉 3rd: **5 PT**', inline: false },
    )
    .setFooter({ text: `Tournament #${t.id} • Only one champion survives the multiverse` })
    .setTimestamp();
}

function panelComponents(t) {
  if (t.status === 'registration') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tournament_join_${t.id}`).setLabel('Enter Arena').setEmoji('🏆').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tournament_participants_${t.id}`).setLabel('View Challengers').setEmoji('👥').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tournament_leave_${t.id}`).setLabel('Leave Arena').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    )];
  }
  if (t.status === 'active' && t.current_round >= 1 && t.current_round <= 4 && t.power_selection_open && !t.round_started) {
    return [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`tournament_powerselect_${t.id}`)
        .setPlaceholder('⚡ Pick one power before the round starts')
        .addOptions(
          { label: 'Shield — 10 PT', description: 'Blocks one elimination/removal this round', value: 'shield', emoji: '🛡️' },
          { label: 'Double Points — 5 PT', description: 'Doubles points awarded this round', value: 'double_points', emoji: '✖️' },
        ),
    )];
  }
  return [];
}

async function renderBoard(guild, t, players) {
  const width = 1400;
  const shown = players.slice(0, 32);
  const isMatchups = t.current_round === 1 && t.status === 'active';
  const height = Math.max(820, 370 + (isMatchups ? Math.ceil(shown.length / 4) * 112 : shown.length * 42));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
  const rows = [];

  const stages = ['MM2', 'DTI', 'Screenshot', 'Avatar', 'Final'];
  const stageBoxes = stages.map((name, i) => {
    const x = 60 + i * 265;
    const fill = t.current_round > i + 1 || t.status === 'finished' ? '#40d98b' : t.current_round === i + 1 ? '#7b79ff' : '#ffffff24';
    return `<rect x="${x}" y="195" width="230" height="62" rx="16" fill="${fill}"/><text x="${x + 20}" y="234" class="stage">${esc(name)}</text>`;
  }).join('');

  if (isMatchups) {
    const shuffled = [...shown].sort((a, b) => String(a.seed_key).localeCompare(String(b.seed_key)));
    shuffled.forEach((p, index) => {
      const pair = Math.floor(index / 2);
      const col = pair % 2;
      const row = Math.floor(pair / 2);
      const x = 60 + col * 670;
      const y = 360 + row * 112 + (index % 2) * 44;
      const fill = index % 2 === 0 ? '#7b79ff55' : '#ffffff1f';
      rows.push(`<rect x="${x}" y="${y}" width="610" height="36" rx="10" fill="${fill}"/><text x="${x + 14}" y="${y + 25}" class="row">${index % 2 === 0 ? 'A' : 'B'}  ${esc(safeName(p.display_name))}  (${score(p)} pts)</text>`);
    });
  } else {
    shown.forEach((p, i) => {
      const y = 360 + i * 42;
      const fill = i < 2 ? '#ffd75c38' : i % 2 ? '#ffffff14' : '#ffffff20';
      rows.push(`<rect x="60" y="${y}" width="1280" height="34" rx="9" fill="${fill}"/><text x="78" y="${y + 24}" class="${i < 2 ? 'toprow' : 'row'}">${i + 1}. ${esc(safeName(p.display_name))}</text><text x="650" y="${y + 24}" class="subrow">${p.roblox_username ? '@' + esc(safeName(p.roblox_username)) : ''}</text><text x="1160" y="${y + 24}" class="${i < 2 ? 'toprow' : 'row'}">${score(p)} pts</text>`);
    });
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#11162f"/><stop offset="0.55" stop-color="#212057"/><stop offset="1" stop-color="#471d65"/></linearGradient>
    <pattern id="grid" width="70" height="70" patternUnits="userSpaceOnUse"><path d="M 70 0 L 0 0 0 70" fill="none" stroke="#ffffff" stroke-opacity="0.07" stroke-width="1"/></pattern>
    <style>.title{font:700 52px Arial,sans-serif;fill:#fff}.meta{font:26px Arial,sans-serif;fill:#c7ccff}.heading{font:700 30px Arial,sans-serif;fill:#fff}.stage{font:700 22px Arial,sans-serif;fill:#fff}.row{font:20px Arial,sans-serif;fill:#fff}.toprow{font:700 20px Arial,sans-serif;fill:#fff}.subrow{font:17px Arial,sans-serif;fill:#bdc5ff}</style>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/><rect width="100%" height="100%" fill="url(#grid)"/>
  <text x="60" y="78" class="title">${esc(safeName(t.name))}</text>
  <text x="62" y="122" class="meta">${esc(stageLabel(t))}</text>
  <text x="62" y="158" class="meta">Prize: ${esc(safeName(t.prize))}</text>
  ${stageBoxes}
  <text x="60" y="320" class="heading">${isMatchups ? 'Round 1 Matchups' : 'Live Leaderboard'}</text>
  ${rows.join('\n')}
</svg>`;
  return new AttachmentBuilder(Buffer.from(svg, 'utf8'), { name: `tournament-${t.id}-board.svg`, description: `${t.name} tournament board` });
}
async function updatePanel(client, t) {
  if (!t.channel_id || !t.message_id) return;
  const guild = client.guilds.cache.get(t.guild_id);
  const channel = guild?.channels.cache.get(t.channel_id);
  if (!channel?.isTextBased()) return;
  const players = q.players.all(t.id);
  const msg = await channel.messages.fetch(t.message_id).catch(() => null);
  if (!msg) return;
  await msg.edit({ embeds: [panelEmbed(t, players)], components: panelComponents(t) }).catch(() => {});
}

async function handleCommand(interaction, client) {
  const sub = interaction.options.getSubcommand();
  const publicSubs = new Set(['leaderboard', 'participants', 'vote-dti', 'power', 'guide', 'bracket-view']);
  if (!publicSubs.has(sub) && !canManage(interaction)) {
    return interaction.reply({ content: '❌ Only tournament managers or server administrators can use this.', ephemeral: true });
  }
  const guildId = interaction.guild.id;
  let t = q.active.get(guildId);

  if (sub === 'config') {
    const manager = interaction.options.getRole('manager_role');
    const channel = interaction.options.getChannel('announcement_channel');
    const participant = interaction.options.getRole('participant_role');
    if (manager) setConfig(guildId, 'tournament_manager_role', manager.id);
    if (channel) setConfig(guildId, 'tournament_announcement_channel', channel.id);
    if (participant) setConfig(guildId, 'tournament_participant_role', participant.id);
    return interaction.reply({ content: `✅ Tournament configuration updated.${manager ? `\nManager: ${manager}` : ''}${channel ? `\nAnnouncements: ${channel}` : ''}${participant ? `\nParticipant role: ${participant}` : ''}`, ephemeral: true });
  }

  if (sub === 'create') {
    if (t && !['finished', 'deleted'].includes(t.status)) return interaction.reply({ content: '❌ An active tournament already exists. End or delete it first.', ephemeral: true });
    const channel = interaction.options.getChannel('channel') || interaction.guild.channels.cache.get(getConfig(guildId, 'tournament_announcement_channel')) || interaction.channel;
    const role = interaction.options.getRole('participant_role');
    const result = db.prepare(`INSERT INTO tournaments (guild_id,name,prize,max_players,status,current_round,channel_id,participant_role_id,created_by,created_at) VALUES (?,?,?,?, 'registration',0,?,?,?,?)`).run(
      guildId,
      interaction.options.getString('name'),
      interaction.options.getString('prize'),
      interaction.options.getInteger('max_players'),
      channel.id,
      role?.id || getConfig(guildId, 'tournament_participant_role'),
      interaction.user.id,
      Date.now(),
    );
    t = q.byId.get(result.lastInsertRowid);
    const msg = await channel.send({ embeds: [panelEmbed(t, [])], components: panelComponents(t) });
    db.prepare(`UPDATE tournaments SET message_id=? WHERE id=?`).run(msg.id, t.id);
    return interaction.reply({ content: `✅ Tournament created in ${channel}.`, ephemeral: true });
  }

  if (!t) return interaction.reply({ content: '❌ There is no tournament configured.', ephemeral: true });

  if (sub === 'guide') return interaction.reply({ embeds: [bracket.detailedGuide(t)], ephemeral: !canManage(interaction) });

  if (sub === 'roster-add') {
    const user=interaction.options.getUser('user'), username=interaction.options.getString('roblox_username');
    const member=await interaction.guild.members.fetch(user.id).catch(()=>null);
    db.prepare(`INSERT INTO tournament_players(tournament_id,user_id,display_name,roblox_username,joined_at,active) VALUES(?,?,?,?,?,1) ON CONFLICT(tournament_id,user_id) DO UPDATE SET display_name=excluded.display_name,roblox_username=excluded.roblox_username,active=1`).run(t.id,user.id,member?.displayName||user.username,username,Date.now());
    if(member&&t.participant_role_id)await member.roles.add(t.participant_role_id).catch(()=>{});
    return interaction.reply({embeds:[successEmbed('Player Added',`${user} is now active. Generate or shuffle the bracket again before approval.`)],ephemeral:true});
  }
  if (sub === 'roster-remove') {
    const user=interaction.options.getUser('user'); db.prepare('UPDATE tournament_players SET active=0 WHERE tournament_id=? AND user_id=?').run(t.id,user.id); db.prepare('DELETE FROM tournament_checkins WHERE tournament_id=? AND user_id=?').run(t.id,user.id);
    return interaction.reply({embeds:[successEmbed('No-Show Removed',`${user} was removed from the active roster. Existing scores/history were kept.`)],ephemeral:true});
  }
  if (sub === 'checkin-open') {
    const mins=interaction.options.getInteger('minutes'), closes=Date.now()+mins*60000, channel=interaction.guild.channels.cache.get(t.channel_id)||interaction.channel;
    db.prepare('DELETE FROM tournament_checkins WHERE tournament_id=?').run(t.id);
    db.prepare(`INSERT INTO tournament_checkin_state(tournament_id,closes_at,open,channel_id) VALUES(?,?,1,?) ON CONFLICT(tournament_id) DO UPDATE SET closes_at=excluded.closes_at,open=1,channel_id=excluded.channel_id`).run(t.id,closes,channel.id);
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`tournament_checkin_${t.id}`).setLabel("I'm Ready").setEmoji('✅').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`tournament_withdraw_${t.id}`).setLabel('Withdraw').setEmoji('🚪').setStyle(ButtonStyle.Secondary));
    const msg=await channel.send({embeds:[infoEmbed('👗 DTI Player Check-In',`Press **I’m Ready** to confirm you are present and able to participate.\n\nThis does **not** start Dress to Impress and does **not** submit an outfit. Players who do not check in before <t:${Math.floor(closes/1000)}:F> may be removed before the bracket is generated.`)],components:[row]});
    db.prepare('UPDATE tournament_checkin_state SET message_id=? WHERE tournament_id=?').run(msg.id,t.id);return interaction.reply({content:`✅ Check-in opened in ${channel}.`,ephemeral:true});
  }
  if (sub === 'checkin-close') {
    const remove=interaction.options.getBoolean('remove_absent');db.prepare('UPDATE tournament_checkin_state SET open=0 WHERE tournament_id=?').run(t.id);const active=q.players.all(t.id),checked=new Set(db.prepare('SELECT user_id FROM tournament_checkins WHERE tournament_id=?').all(t.id).map(x=>x.user_id)),missing=active.filter(x=>!checked.has(x.user_id));if(remove&&missing.length){const up=db.prepare('UPDATE tournament_players SET active=0 WHERE tournament_id=? AND user_id=?');db.transaction(()=>missing.forEach(x=>up.run(t.id,x.user_id)))();}
    return interaction.reply({embeds:[infoEmbed('Check-In Closed',`✅ Checked in: **${checked.size}**\n⚠️ Missing: **${missing.length}**${remove?'\nAbsent players were removed from the active roster.':'\nAbsent players were kept for manual review.'}\n\nNext: run \`/tournament bracket-generate\`.`)]});
  }
  if (sub === 'bracket-generate' || sub === 'bracket-shuffle') {
    const old=bracket.state(t.id,t.current_round||2);if(old?.status==='approved')return interaction.reply({content:'❌ Unlock the bracket before changing it.',ephemeral:true});const rows=bracket.generate(t,q.players.all(t.id));return interaction.reply({embeds:[bracket.previewEmbed(t,rows)],ephemeral:true});
  }
  if (sub === 'bracket-view') {const rows=bracket.matches(t.id,t.current_round||2);return interaction.reply({embeds:[bracket.previewEmbed(t,rows)],ephemeral:canManage(interaction)});}
  if (sub === 'bracket-edit') {
    const round=t.current_round||2,st=bracket.state(t.id,round);if(st?.status==='approved')return interaction.reply({content:'❌ Unlock the bracket before editing.',ephemeral:true});const num=interaction.options.getInteger('match'),p1=interaction.options.getUser('player_one'),p2=interaction.options.getUser('player_two');if(!p1&&!p2)return interaction.reply({content:'❌ Select at least Player One.',ephemeral:true});db.prepare(`INSERT INTO tournament_bracket_matches(tournament_id,round_number,match_number,player1_id,player2_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?) ON CONFLICT(tournament_id,round_number,match_number) DO UPDATE SET player1_id=excluded.player1_id,player2_id=excluded.player2_id,winner_id=NULL,status='pending',updated_at=excluded.updated_at`).run(t.id,round,num,p1?.id||p2.id,p1?p2?.id||null:null,Date.now(),Date.now());db.prepare(`INSERT INTO tournament_bracket_state(tournament_id,round_number,status,version,updated_at) VALUES(?,?,'preview',1,?) ON CONFLICT(tournament_id,round_number) DO UPDATE SET status='preview',version=version+1,updated_at=excluded.updated_at`).run(t.id,round,Date.now());return interaction.reply({embeds:[bracket.previewEmbed(t,bracket.matches(t.id,round))],ephemeral:true});
  }
  if (sub === 'bracket-approve') {const round=t.current_round||2,rows=bracket.matches(t.id,round);if(!rows.length)return interaction.reply({content:'❌ Generate a bracket first.',ephemeral:true});db.prepare("UPDATE tournament_bracket_state SET status='approved',updated_at=? WHERE tournament_id=? AND round_number=?").run(Date.now(),t.id,round);await bracket.publish(interaction,t);return interaction.reply({embeds:[successEmbed('Bracket Approved and Published','The matchups are official. Players should now select powers before the manager starts the game.')],ephemeral:true});}
  if (sub === 'bracket-unlock') {const rs=q.roundState.get(t.id,t.current_round||2);if(rs?.submission_deadline&&Date.now()<rs.submission_deadline)return interaction.reply({content:'❌ Submissions are already active. Close or finish the submission stage before changing matchups.',ephemeral:true});db.prepare("UPDATE tournament_bracket_state SET status='preview',version=version+1,updated_at=? WHERE tournament_id=? AND round_number=?").run(Date.now(),t.id,t.current_round||2);return interaction.reply({content:'🔓 Bracket unlocked. All edits require approval again.',ephemeral:true});}

  if (sub === 'power') return selectPower(interaction, t, interaction.options.getString('choice'));

  if (sub === 'start') {
    const count = q.count.get(t.id).c;
    if (count < 2) return interaction.reply({ content: '❌ At least 2 players must register.', ephemeral: true });
    db.prepare(`UPDATE tournaments SET status='active', current_round=1, power_selection_open=1, round_started=0, started_at=? WHERE id=?`).run(Date.now(), t.id);
    db.prepare(`UPDATE tournament_players SET seed_key=lower(hex(randomblob(16))) WHERE tournament_id=?`).run(t.id);
    t = q.byId.get(t.id);
    await interaction.reply({ content: `⚡ **${t.name} — Round 1 power selection is open!**
Players may pick **one** power before the game begins:
🛡️ Shield — 10 PT
✖️ Double Points — 5 PT

A Tournament Manager must use \`/tournament begin-round\` to lock powers and begin ${GAMES[0]}.` });
    return updatePanel(client, t);
  }

  if (sub === 'begin-round') {
    if (t.status !== 'active' || t.current_round < 1 || t.current_round > 5) return interaction.reply({ content: '❌ There is no round ready to begin.', ephemeral: true });
    if (t.round_started) return interaction.reply({ content: '❌ This round has already started.', ephemeral: true });
    db.prepare('UPDATE tournaments SET power_selection_open=0, round_started=1 WHERE id=?').run(t.id);
    t = q.byId.get(t.id);
    const players = q.players.all(t.id);
    const board = await renderBoard(interaction.guild, t, players);
    await interaction.reply({ content: `▶️ **Round ${t.current_round} has started: ${GAMES[t.current_round - 1]}**
Power selections are now locked.`, files: [board] });
    return updatePanel(client, t);
  }

  if (sub === 'report-mm2') {
    if (t.status !== 'active' || t.current_round !== 1 || !t.round_started) return interaction.reply({ content: '❌ MM2 results can only be reported during Round 1.', ephemeral: true });
    const winner = interaction.options.getUser('winner');
    const loser = interaction.options.getUser('loser');
    if (winner.id === loser.id) return interaction.reply({ content: '❌ Winner and loser must be different players.', ephemeral: true });
    const wp = q.player.get(t.id, winner.id);
    const lp = q.player.get(t.id, loser.id);
    if (!wp?.active || !lp?.active) return interaction.reply({ content: '❌ Both users must be active tournament participants.', ephemeral: true });
    const baseWinnerPoints = interaction.options.getInteger('winner_points') ?? 10;
    const baseLoserPoints = interaction.options.getInteger('loser_points') ?? 1;
    const winnerPoints = doubledPoints(t, winner.id, baseWinnerPoints);
    const loserPoints = doubledPoints(t, loser.id, baseLoserPoints);
    const shieldUsed = consumeShield(t.id, 1, loser.id);
    const notes = interaction.options.getString('notes');
    const tx = db.transaction(() => {
      db.prepare(`UPDATE tournament_players SET round1_points=? WHERE tournament_id=? AND user_id=?`).run(winnerPoints, t.id, winner.id);
      db.prepare(`UPDATE tournament_players SET round1_points=? WHERE tournament_id=? AND user_id=?`).run(loserPoints, t.id, loser.id);
      db.prepare(`INSERT INTO tournament_mm2_results (tournament_id,winner_id,loser_id,winner_points,loser_points,reported_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(t.id, winner.id, loser.id, winnerPoints, loserPoints, interaction.user.id, notes, Date.now());
    });
    tx();
    await interaction.reply({ content: `✅ MM2 result saved by a Tournament Manager.
Winner: ${winner} — **${winnerPoints} pts**
Loser: ${loser} — **${loserPoints} pts**${shieldUsed ? '\n🛡️ Their Shield was consumed and protected them from elimination.' : ''}`, ephemeral: true });
    return updatePanel(client, q.byId.get(t.id));
  }

  if (sub === 'open-dti') {
    if (t.status !== 'active' || t.current_round !== 2 || !t.round_started) return interaction.reply({ content: '❌ Dress to Impress submissions can only open during Round 2.', ephemeral: true });
    const theme = interaction.options.getString('theme');
    const minutes = interaction.options.getInteger('minutes');
    const deadline = Date.now() + minutes * 60_000;
    db.prepare(`INSERT INTO tournament_round_state (tournament_id,round_number,theme,submission_deadline,voting_open,voting_closed,created_at) VALUES (?,2,?,?,0,0,?) ON CONFLICT(tournament_id,round_number) DO UPDATE SET theme=excluded.theme,submission_deadline=excluded.submission_deadline,voting_open=0,voting_closed=0`).run(t.id, theme, deadline, Date.now());
    const unix = Math.floor(deadline / 1000);
    const components = [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tournament_dtisubmit_${t.id}`)
        .setLabel('Submit Outfit')
        .setEmoji('🖼️')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`tournament_dtirules_${t.id}`)
        .setLabel('View Rules')
        .setEmoji('📜')
        .setStyle(ButtonStyle.Secondary),
    )];
    return interaction.reply({
      content: `👗 **Dress to Impress submissions are open!**\n**Theme:** ${theme}\n**Deadline:** <t:${unix}:F> (<t:${unix}:R>)\n\nClick **Submit Outfit** below. DripCore will privately DM you and collect your screenshot there, so other players cannot see whose entry it is.\n\nThe bot rejects every screenshot received after the deadline. You may replace your entry by clicking the button again before time expires.`,
      components,
    });
  }

  if (sub === 'open-dti-voting') {
    if (t.status !== 'active' || t.current_round !== 2 || !t.round_started) return interaction.reply({ content: '❌ DTI voting can only open during Round 2.', ephemeral: true });
    const state = q.roundState.get(t.id, 2);
    if (!state?.submission_deadline) return interaction.reply({ content: '❌ Open submissions first.', ephemeral: true });
    if (Date.now() < state.submission_deadline) return interaction.reply({ content: `❌ Submissions are still open until <t:${Math.floor(state.submission_deadline / 1000)}:F>.`, ephemeral: true });
    const submissions = q.dtiSubmissions.all(t.id);
    if (submissions.length < 2) return interaction.reply({ content: '❌ At least two outfits are required to open voting.', ephemeral: true });
    db.prepare(`UPDATE tournament_round_state SET voting_open=1,voting_closed=0 WHERE tournament_id=? AND round_number=2`).run(t.id);
    await interaction.reply({ content: `🗳️ **Anonymous Dress to Impress voting is open!**
Theme: **${state.theme || 'Not specified'}**
Use \`/tournament vote-dti submission:<number>\`. Votes are saved privately and totals remain hidden. You cannot vote for your own outfit. Every active participant must vote before managers can close voting.` });
    for (let i = 0; i < submissions.length; i++) {
      const subm = submissions[i];
      const embed = new EmbedBuilder().setColor(0x22c55e).setTitle(`Anonymous Outfit #${i + 1}`).setImage(subm.image_url);
      if (subm.caption) embed.setDescription(subm.caption);
      await interaction.channel.send({ embeds: [embed] });
    }
    return;
  }

  if (sub === 'vote-dti') {
    if (t.status !== 'active' || t.current_round !== 2 || !t.round_started) return interaction.reply({ content: '❌ DTI voting is not active.', ephemeral: true });
    const player = q.player.get(t.id, interaction.user.id);
    if (!player?.active) return interaction.reply({ content: '❌ Only active tournament participants may vote.', ephemeral: true });
    const state = q.roundState.get(t.id, 2);
    if (!state?.voting_open || state.voting_closed) return interaction.reply({ content: '❌ Voting is not open.', ephemeral: true });
    const number = interaction.options.getInteger('submission');
    const submission = q.dtiSubmissionByNumber.get(t.id, number - 1);
    if (!submission) return interaction.reply({ content: '❌ That anonymous submission number does not exist.', ephemeral: true });
    if (submission.user_id === interaction.user.id) return interaction.reply({ content: '❌ You cannot vote for your own outfit.', ephemeral: true });
    db.prepare(`INSERT INTO tournament_votes (tournament_id,round_number,voter_id,submission_id,voted_at) VALUES (?,2,?,?,?) ON CONFLICT(tournament_id,round_number,voter_id) DO UPDATE SET submission_id=excluded.submission_id,voted_at=excluded.voted_at`).run(t.id, interaction.user.id, submission.id, Date.now());
    return interaction.reply({ content: `✅ Your secret vote for **Anonymous Outfit #${number}** was saved. No reaction or public count is shown. You may change it while voting remains open.`, ephemeral: true });
  }

  if (sub === 'close-dti-voting') {
    const state = q.roundState.get(t.id, 2);
    if (!state?.voting_open || state.voting_closed) return interaction.reply({ content: '❌ DTI voting is not currently open.', ephemeral: true });
    const force = interaction.options.getBoolean('force') || false;
    const eligible = db.prepare(`SELECT user_id FROM tournament_players WHERE tournament_id=? AND active=1`).all(t.id);
    const voted = new Set(db.prepare(`SELECT voter_id FROM tournament_votes WHERE tournament_id=? AND round_number=2`).all(t.id).map(r => r.voter_id));
    const missing = eligible.filter(p => !voted.has(p.user_id));
    if (missing.length && !force) return interaction.reply({ content: `⚠️ Voting cannot close yet. **${voted.size}/${eligible.length}** eligible participants have voted.
Still missing: ${missing.map(x => `<@${x.user_id}>`).join(' ').slice(0, 1500)}

Use \`force:true\` only for unavailable, removed, or disqualified players.`, ephemeral: true });
    db.prepare(`UPDATE tournament_round_state SET voting_open=0,voting_closed=1 WHERE tournament_id=? AND round_number=2`).run(t.id);
    const results = db.prepare(`SELECT s.id,s.user_id,COUNT(v.submission_id) votes FROM tournament_submissions s LEFT JOIN tournament_votes v ON v.submission_id=s.id AND v.tournament_id=s.tournament_id AND v.round_number=2 WHERE s.tournament_id=? AND s.round_number=2 GROUP BY s.id ORDER BY votes DESC,s.submitted_at ASC`).all(t.id);
    const pointScale = [10, 8, 6, 4];
    const tx = db.transaction(() => results.forEach((r, i) => db.prepare(`UPDATE tournament_players SET round2_points=? WHERE tournament_id=? AND user_id=?`).run(doubledPoints(t, r.user_id, pointScale[i] ?? 1), t.id, r.user_id)));
    tx();
    const lines = results.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.votes} votes** — **${doubledPoints(t, r.user_id, pointScale[i] ?? 1)} pts**`).join('\n');
    await interaction.reply({ content: `✅ **DTI voting closed${force && missing.length ? ' with manager override' : ''}.**
Individual voters remain private.

${lines}` });
    return updatePanel(client, q.byId.get(t.id));
  }

  if (sub === 'award') {
    if (t.status !== 'active' || t.current_round < 1 || t.current_round > 4) return interaction.reply({ content: '❌ Points can only be awarded during rounds 1–4.', ephemeral: true });
    const user = interaction.options.getUser('user');
    const p = q.player.get(t.id, user.id);
    if (!p || !p.active) return interaction.reply({ content: '❌ That user is not an active participant.', ephemeral: true });
    const basePoints = interaction.options.getInteger('points');
    const points = doubledPoints(t, user.id, basePoints);
    const col = `round${t.current_round}_points`;
    db.prepare(`UPDATE tournament_players SET ${col}=? WHERE tournament_id=? AND user_id=?`).run(points, t.id, user.id);
    const note = interaction.options.getString('note');
    db.prepare(`INSERT INTO tournament_awards (tournament_id,user_id,round_number,points,note,awarded_by,created_at) VALUES (?,?,?,?,?,?,?)`).run(t.id, user.id, t.current_round, points, note, interaction.user.id, Date.now());
    await interaction.reply({ content: `✅ ${user} now has **${points} points** for Round ${t.current_round}.`, ephemeral: true });
    return updatePanel(client, q.byId.get(t.id));
  }

  if (sub === 'contribution') {
    const user = interaction.options.getUser('user');
    const p = q.player.get(t.id, user.id);
    if (!p || !p.active) return interaction.reply({ content: '❌ That user is not an active participant.', ephemeral: true });
    const points = Math.min(5, interaction.options.getInteger('points'));
    db.prepare(`UPDATE tournament_players SET contribution_points=? WHERE tournament_id=? AND user_id=?`).run(points, t.id, user.id);
    await interaction.reply({ content: `✅ ${user} will start with **${points}/5 contribution bonus points**.`, ephemeral: true });
    return updatePanel(client, q.byId.get(t.id));
  }

  if (sub === 'next-round') {
    if (t.status !== 'active') return interaction.reply({ content: '❌ The tournament is not active.', ephemeral: true });
    if (!t.round_started) return interaction.reply({ content: '❌ Begin the current round before advancing.', ephemeral: true });
    if (t.current_round >= 5) return interaction.reply({ content: '❌ You are already at the Grand Finale.', ephemeral: true });
    const next = t.current_round + 1;
    db.prepare(`UPDATE tournaments SET current_round=?, power_selection_open=?, round_started=0 WHERE id=?`).run(next, next <= 4 ? 1 : 0, t.id);
    t = q.byId.get(t.id);
    const players = q.players.all(t.id);
    if (next === 5) {
      const finalists = players.slice(0, 2);
      db.prepare(`UPDATE tournaments SET finalist1_id=?, finalist2_id=? WHERE id=?`).run(finalists[0]?.user_id || null, finalists[1]?.user_id || null, t.id);
      t = q.byId.get(t.id);
      const board = await renderBoard(interaction.guild, t, players);
      await interaction.reply({ content: `👑 **GRAND FINALE**\n<@${t.finalist1_id}> vs <@${t.finalist2_id}>\nThe final challenge can be announced later.`, files: [board] });
    } else {
      const board = await renderBoard(interaction.guild, t, players);
      await interaction.reply({ content: `⚡ **Round ${next} power selection is open.** Players may choose one power before **${GAMES[next - 1]}** starts. Use \`/tournament begin-round\` when ready.`, files: [board] });
    }
    return updatePanel(client, t);
  }

  if (sub === 'leaderboard') {
    const players = q.players.all(t.id);
    const board = await renderBoard(interaction.guild, t, players);
    return interaction.reply({ embeds: [panelEmbed(t, players)], files: [board] });
  }

  if (sub === 'participants') {
    const players = q.players.all(t.id);
    const lines = players.map((p, i) => `${i + 1}. <@${p.user_id}> — Roblox: **${p.roblox_username || 'Not set'}** — ${score(p)} pts`);
    return interaction.reply({ content: lines.length ? lines.join('\n').slice(0, 1900) : 'No registered participants.', ephemeral: true });
  }

  if (sub === 'remove') {
    const user = interaction.options.getUser('user');
    if (t.status === 'active' && t.current_round <= 4 && consumeShield(t.id, t.current_round, user.id)) {
      await interaction.reply({ content: `🛡️ ${user}'s Shield blocked this removal and has now been consumed.`, ephemeral: true });
      return updatePanel(client, q.byId.get(t.id));
    }
    db.prepare(`UPDATE tournament_players SET active=0 WHERE tournament_id=? AND user_id=?`).run(t.id, user.id);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member && t.participant_role_id) await member.roles.remove(t.participant_role_id).catch(() => {});
    await interaction.reply({ content: `✅ Removed ${user} from the tournament.`, ephemeral: true });
    return updatePanel(client, t);
  }

  if (sub === 'end') {
    const winner = interaction.options.getUser('winner');
    const players = q.players.all(t.id);
    const finalistIds = [t.finalist1_id, t.finalist2_id].filter(Boolean);
    if (finalistIds.length === 2 && !finalistIds.includes(winner.id)) return interaction.reply({ content: '❌ The selected winner must be one of the two Grand Finalists.', ephemeral: true });
    const championId = winner.id;
    db.prepare(`UPDATE tournaments SET status='finished', champion_id=?, power_selection_open=0, round_started=1, ended_at=? WHERE id=?`).run(championId || null, Date.now(), t.id);
    t = q.byId.get(t.id);
    const secondId = finalistIds.find(id => id !== championId) || players.find(p => p.user_id !== championId)?.user_id || null;
    const thirdId = players.find(p => p.user_id !== championId && p.user_id !== secondId)?.user_id || null;
    const placements = [[championId, 1, 15], [secondId, 2, 10], [thirdId, 3, 5]].filter(x => x[0]);
    db.transaction(() => {
      for (const [userId, place, tokens] of placements) {
        if (db.prepare('SELECT 1 FROM tournament_placement_rewards WHERE tournament_id=? AND user_id=?').get(t.id, userId)) continue;
        eco.add(guildId, userId, tokens, `Tournament #${t.id} placement reward`, 'SYSTEM');
        db.prepare('INSERT INTO tournament_placement_rewards(tournament_id,guild_id,user_id,place,tokens_awarded,awarded_at) VALUES(?,?,?,?,?,?)').run(t.id, guildId, userId, place, tokens, Date.now());
      }
    })();
    const board = await renderBoard(interaction.guild, t, players);
    const rewardText = placements.map(([id, place, tokens]) => `${place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'} <@${id}> — **${tokens} PT**`).join('\n');
    await interaction.reply({ content: `🏆 **${t.name} is complete!**

${rewardText}

Power Tokens were awarded automatically.`, files: [board] });
    return updatePanel(client, t);
  }

  if (sub === 'delete') {
    if (t.channel_id && t.message_id) {
      const ch = interaction.guild.channels.cache.get(t.channel_id);
      const msg = await ch?.messages.fetch(t.message_id).catch(() => null);
      await msg?.delete().catch(() => {});
    }
    db.prepare(`UPDATE tournaments SET status='deleted' WHERE id=?`).run(t.id);
    return interaction.reply({ content: '✅ Tournament deleted. Existing database history was kept.', ephemeral: true });
  }
}

async function handleInteraction(interaction, client) {
  const parts = interaction.customId.split('_');
  const action = parts[1];
  const id = Number(parts[2]);
  const t = q.byId.get(id);
  if (!t || t.status === 'deleted') return interaction.reply({ content: '❌ This tournament is no longer available.', ephemeral: true });

  if (action === 'powerselect') return selectPower(interaction, t, interaction.values?.[0]);

  if (action === 'participants') {
    const players = q.players.all(t.id);
    const lines = players.map((p, index) => `**${index + 1}.** <@${p.user_id}> • Roblox: **${p.roblox_username || 'Not set'}** • **${score(p)} pts**`).join('\n');
    return interaction.reply({ embeds: [infoEmbed(`${t.name} Challengers`, lines.slice(0, 3900) || 'No challengers have registered yet.')], ephemeral: true });
  }



  if (action === 'checkin') {
    const cs=db.prepare('SELECT * FROM tournament_checkin_state WHERE tournament_id=?').get(t.id);if(!cs?.open||Date.now()>cs.closes_at)return interaction.reply({content:'❌ Check-in is closed.',ephemeral:true});const p=q.player.get(t.id,interaction.user.id);if(!p?.active)return interaction.reply({content:'❌ You are not on the active roster.',ephemeral:true});db.prepare(`INSERT INTO tournament_checkins(tournament_id,user_id,checked_in_at) VALUES(?,?,?) ON CONFLICT(tournament_id,user_id) DO UPDATE SET checked_in_at=excluded.checked_in_at`).run(t.id,interaction.user.id,Date.now());return interaction.reply({embeds:[successEmbed('Checked In','You are confirmed for this game. Wait for the official bracket and theme before starting.')],ephemeral:true});
  }
  if (action === 'withdraw') {db.prepare('UPDATE tournament_players SET active=0 WHERE tournament_id=? AND user_id=?').run(t.id,interaction.user.id);db.prepare('DELETE FROM tournament_checkins WHERE tournament_id=? AND user_id=?').run(t.id,interaction.user.id);return interaction.reply({embeds:[infoEmbed('Withdrawn','You were removed from the active roster. Contact a manager to be added back.')],ephemeral:true});}

  if (action === 'join') {
    if (t.status !== 'registration') return interaction.reply({ content: '❌ Registration is closed.', ephemeral: true });
    if (q.count.get(t.id).c >= t.max_players) return interaction.reply({ content: '❌ The tournament is full.', ephemeral: true });
    const existing = q.player.get(t.id, interaction.user.id);
    if (existing?.active) return interaction.reply({ content: 'You are already registered.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`tournament_joinmodal_${t.id}`).setTitle('Tournament Registration');
    const roblox = new TextInputBuilder().setCustomId('roblox_username').setLabel('Your Roblox username').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(20);
    modal.addComponents(new ActionRowBuilder().addComponents(roblox));
    return interaction.showModal(modal);
  }

  if (action === 'joinmodal') {
    const username = interaction.fields.getTextInputValue('roblox_username').trim();
    db.prepare(`INSERT INTO tournament_players (tournament_id,user_id,display_name,roblox_username,joined_at,active) VALUES (?,?,?,?,?,1)
      ON CONFLICT(tournament_id,user_id) DO UPDATE SET display_name=excluded.display_name,roblox_username=excluded.roblox_username,active=1`).run(
      t.id, interaction.user.id, interaction.member.displayName || interaction.user.username, username, Date.now(),
    );
    if (t.participant_role_id) await interaction.member.roles.add(t.participant_role_id).catch(() => {});
    await interaction.reply({ embeds: [successEmbed('Welcome to the Arena!', `You joined **${t.name}** as Roblox user **${username}**.\n\nTournament powers will become available during the games when applicable.`)], ephemeral: true });
    return updatePanel(client, q.byId.get(t.id));
  }

  if (action === 'dtirules') {
    const state = q.roundState.get(t.id, 2);
    const deadlineText = state?.submission_deadline
      ? `<t:${Math.floor(state.submission_deadline / 1000)}:F> (<t:${Math.floor(state.submission_deadline / 1000)}:R>)`
      : 'Not opened yet';
    return interaction.reply({
      content: `**👗 Dress to Impress Rules**\n\n• Create one outfit matching the announced theme.\n• Click **Submit Outfit** and send one screenshot to DripCore in DMs.\n• Your screenshot stays private until the anonymous gallery is posted.\n• You may replace your entry only before the deadline.\n• No late entries are accepted.\n• Do not tell people which anonymous outfit belongs to you.\n• During voting, you cannot vote for yourself.\n• Votes and live totals remain secret.\n\n**Submission deadline:** ${deadlineText}`,
      ephemeral: true,
    });
  }

  if (action === 'dtisubmit') {
    if (t.status !== 'active' || t.current_round !== 2 || !t.round_started) return interaction.reply({ content: '❌ Outfit submissions are not currently open.', ephemeral: true });
    const player = q.player.get(t.id, interaction.user.id);
    if (!player?.active) return interaction.reply({ content: '❌ Only active tournament participants may submit.', ephemeral: true });
    const state = q.roundState.get(t.id, 2);
    if (!state?.submission_deadline) return interaction.reply({ content: '❌ A Tournament Manager has not opened submissions yet.', ephemeral: true });
    if (Date.now() > state.submission_deadline) return interaction.reply({ content: `⏰ Submissions closed <t:${Math.floor(state.submission_deadline / 1000)}:R>. Late entries cannot be accepted.`, ephemeral: true });
    if (state.voting_open || state.voting_closed) return interaction.reply({ content: '❌ Submissions are locked because voting has started.', ephemeral: true });

    const dm = await interaction.user.createDM().catch(() => null);
    if (!dm) return interaction.reply({ content: '❌ I could not DM you. Enable direct messages from server members, then click **Submit Outfit** again.', ephemeral: true });

    const collectorKey = `${t.id}:${interaction.user.id}`;
    const oldCollector = activeSubmissionCollectors.get(collectorKey);
    if (oldCollector) oldCollector.stop('replaced');

    const remaining = Math.max(1_000, state.submission_deadline - Date.now());
    const waitTime = Math.min(remaining, 5 * 60_000);
    await dm.send(`👗 **${t.name} — Dress to Impress Submission**\n**Theme:** ${state.theme || 'Not specified'}\n**Deadline:** <t:${Math.floor(state.submission_deadline / 1000)}:F>\n\nSend **one message containing your outfit screenshot** in this DM within the next ${Math.ceil(waitTime / 60_000)} minute(s). You may type an optional caption in the same message.\n\nOnly image attachments are accepted. Your entry will remain private until anonymous voting opens.`);
    await interaction.reply({ content: '📩 Check your DMs from DripCore and send your screenshot there. Nothing will be posted publicly.', ephemeral: true });

    const collector = dm.createMessageCollector({
      filter: message => message.author.id === interaction.user.id,
      time: waitTime,
      max: 1,
    });
    activeSubmissionCollectors.set(collectorKey, collector);

    collector.on('collect', async message => {
      activeSubmissionCollectors.delete(collectorKey);
      const freshTournament = q.byId.get(t.id);
      const freshState = q.roundState.get(t.id, 2);
      if (!freshTournament || freshTournament.status !== 'active' || freshTournament.current_round !== 2 || !freshState?.submission_deadline || Date.now() > freshState.submission_deadline || freshState.voting_open || freshState.voting_closed) {
        return message.reply('⏰ The submission deadline has passed or submissions are now locked. This screenshot was not accepted.');
      }
      const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
      if (!image) {
        return message.reply('❌ That message did not include an image. Click **Submit Outfit** in the tournament channel again and send one image attachment.');
      }
      const caption = message.content?.trim().slice(0, 80) || null;
      db.prepare(`INSERT INTO tournament_submissions (tournament_id,round_number,user_id,image_url,caption,submitted_at) VALUES (?,2,?,?,?,?) ON CONFLICT(tournament_id,round_number,user_id) DO UPDATE SET image_url=excluded.image_url,caption=excluded.caption,submitted_at=excluded.submitted_at`).run(t.id, interaction.user.id, image.url, caption, Date.now());
      return message.reply(`✅ Your outfit was saved privately. You may replace it by clicking **Submit Outfit** again before <t:${Math.floor(freshState.submission_deadline / 1000)}:F>.`);
    });

    collector.on('end', async (_collected, reason) => {
      if (activeSubmissionCollectors.get(collectorKey) === collector) activeSubmissionCollectors.delete(collectorKey);
      if (reason === 'time') await dm.send('⌛ Your screenshot request expired. Click **Submit Outfit** again before the tournament deadline to try again.').catch(() => {});
    });
    return;
  }

  if (action === 'leave') {
    db.prepare(`UPDATE tournament_players SET active=0 WHERE tournament_id=? AND user_id=?`).run(t.id, interaction.user.id);
    if (t.participant_role_id) await interaction.member.roles.remove(t.participant_role_id).catch(() => {});
    await interaction.reply({ embeds: [infoEmbed('Left the Arena', `You left **${t.name}** and have been removed from the active challenger list.`)], ephemeral: true });
    return updatePanel(client, q.byId.get(t.id));
  }
}

module.exports = { handleCommand, handleInteraction };
