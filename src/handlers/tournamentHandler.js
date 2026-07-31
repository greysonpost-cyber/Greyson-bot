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
const eco = require('../services/economy');
const { successEmbed, errorEmbed, infoEmbed } = require('../utils/embeds');

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
  return `Round ${t.current_round}: ${GAMES[Math.max(0, t.current_round - 1)]}`;
}

function panelEmbed(t, players) {
  const medals = ['🥇', '🥈', '🥉'];
  const top = players.slice(0, 10).map((p, i) => `${medals[i] || `**${i + 1}.**`} <@${p.user_id}> — **${score(p)} pts**${p.token_bonus_points ? ` • 💠 +${p.token_bonus_points}` : ''}`).join('\n') || '🕸️ No challengers have entered the arena yet.';
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
      { name: '💠 POWER TOKEN BOOSTS', value: 'Registered players may choose **+1, +3, or +5 starting points**. The PT cost matches the points, and only one boost may be used per tournament.', inline: false },
      { name: '✨ CONTRIBUTION BONUS', value: 'Prize-pool contributors may receive **0–5 additional starting points** from Tournament Managers.', inline: false },
    )
    .setFooter({ text: `Tournament #${t.id} • Only one champion survives the multiverse` })
    .setTimestamp();
}

function panelComponents(t) {
  if (t.status !== 'registration') return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tournament_join_${t.id}`).setLabel('Enter Arena').setEmoji('🏆').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tournament_participants_${t.id}`).setLabel('View Challengers').setEmoji('👥').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tournament_leave_${t.id}`).setLabel('Leave Arena').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`tournament_boost_${t.id}`)
        .setPlaceholder('💠 Choose a tournament point boost')
        .addOptions(
          { label: '+1 Starting Point', description: 'Spend 1 Power Token', value: '1', emoji: '💠' },
          { label: '+3 Starting Points', description: 'Spend 3 Power Tokens', value: '3', emoji: '⚡' },
          { label: '+5 Starting Points', description: 'Spend 5 Power Tokens', value: '5', emoji: '🌌' }
        )
    )
  ];
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
  const publicSubs = new Set(['leaderboard', 'participants', 'vote-dti']);
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

  if (sub === 'start') {
    const count = q.count.get(t.id).c;
    if (count < 2) return interaction.reply({ content: '❌ At least 2 players must register.', ephemeral: true });
    db.prepare(`UPDATE tournaments SET status='active', current_round=1, started_at=? WHERE id=?`).run(Date.now(), t.id);
    db.prepare(`UPDATE tournament_players SET seed_key=lower(hex(randomblob(16))) WHERE tournament_id=?`).run(t.id);
    t = q.byId.get(t.id);
    const players = q.players.all(t.id);
    const board = await renderBoard(interaction.guild, t, players);
    await interaction.reply({ content: `🏆 **${t.name} has started!**\nRound 1: ${GAMES[0]}`, files: [board] });
    return updatePanel(client, t);
  }

  if (sub === 'report-mm2') {
    if (t.status !== 'active' || t.current_round !== 1) return interaction.reply({ content: '❌ MM2 results can only be reported during Round 1.', ephemeral: true });
    const winner = interaction.options.getUser('winner');
    const loser = interaction.options.getUser('loser');
    if (winner.id === loser.id) return interaction.reply({ content: '❌ Winner and loser must be different players.', ephemeral: true });
    const wp = q.player.get(t.id, winner.id);
    const lp = q.player.get(t.id, loser.id);
    if (!wp?.active || !lp?.active) return interaction.reply({ content: '❌ Both users must be active tournament participants.', ephemeral: true });
    const winnerPoints = interaction.options.getInteger('winner_points') ?? 10;
    const loserPoints = interaction.options.getInteger('loser_points') ?? 1;
    const notes = interaction.options.getString('notes');
    const tx = db.transaction(() => {
      db.prepare(`UPDATE tournament_players SET round1_points=? WHERE tournament_id=? AND user_id=?`).run(winnerPoints, t.id, winner.id);
      db.prepare(`UPDATE tournament_players SET round1_points=? WHERE tournament_id=? AND user_id=?`).run(loserPoints, t.id, loser.id);
      db.prepare(`INSERT INTO tournament_mm2_results (tournament_id,winner_id,loser_id,winner_points,loser_points,reported_by,notes,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(t.id, winner.id, loser.id, winnerPoints, loserPoints, interaction.user.id, notes, Date.now());
    });
    tx();
    await interaction.reply({ content: `✅ MM2 result saved by a Tournament Manager.
Winner: ${winner} — **${winnerPoints} pts**
Loser: ${loser} — **${loserPoints} pts**`, ephemeral: true });
    return updatePanel(client, q.byId.get(t.id));
  }

  if (sub === 'open-dti') {
    if (t.status !== 'active' || t.current_round !== 2) return interaction.reply({ content: '❌ Dress to Impress submissions can only open during Round 2.', ephemeral: true });
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
    if (t.status !== 'active' || t.current_round !== 2) return interaction.reply({ content: '❌ DTI voting can only open during Round 2.', ephemeral: true });
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
    if (t.status !== 'active' || t.current_round !== 2) return interaction.reply({ content: '❌ DTI voting is not active.', ephemeral: true });
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
    const tx = db.transaction(() => results.forEach((r, i) => db.prepare(`UPDATE tournament_players SET round2_points=? WHERE tournament_id=? AND user_id=?`).run(pointScale[i] ?? 1, t.id, r.user_id)));
    tx();
    const lines = results.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.votes} votes** — **${pointScale[i] ?? 1} pts**`).join('\n');
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
    const points = interaction.options.getInteger('points');
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
    if (t.current_round >= 5) return interaction.reply({ content: '❌ You are already at the Grand Finale.', ephemeral: true });
    const next = t.current_round + 1;
    db.prepare(`UPDATE tournaments SET current_round=? WHERE id=?`).run(next, t.id);
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
      await interaction.reply({ content: `▶️ Round ${next} has started: **${GAMES[next - 1]}**`, files: [board] });
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
    db.prepare(`UPDATE tournaments SET status='finished', champion_id=?, ended_at=? WHERE id=?`).run(championId || null, Date.now(), t.id);
    t = q.byId.get(t.id);
    const board = await renderBoard(interaction.guild, t, players);
    await interaction.reply({ content: championId ? `🏆 **${t.name} is complete!**\nChampion: <@${championId}>` : `🏆 **${t.name} is complete!**`, files: [board] });
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

  if (action === 'participants') {
    const players = q.players.all(t.id);
    const lines = players.map((p, index) => `**${index + 1}.** <@${p.user_id}> • Roblox: **${p.roblox_username || 'Not set'}** • **${score(p)} pts**`).join('\n');
    return interaction.reply({ embeds: [infoEmbed(`${t.name} Challengers`, lines.slice(0, 3900) || 'No challengers have registered yet.')], ephemeral: true });
  }

  if (action === 'boost') {
    if (t.status !== 'registration') return interaction.reply({ embeds: [errorEmbed('Boosts Closed', 'Tournament boosts are available only during registration.')], ephemeral: true });
    const player = q.player.get(t.id, interaction.user.id);
    if (!player?.active) return interaction.reply({ embeds: [errorEmbed('Join First', 'Enter the tournament before purchasing a point boost.')], ephemeral: true });
    const amount = Number(interaction.values?.[0]);
    if (![1, 3, 5].includes(amount)) return interaction.reply({ embeds: [errorEmbed('Invalid Boost', 'Choose a valid option from the menu.')], ephemeral: true });
    const used = db.prepare('SELECT * FROM tournament_token_boosts WHERE tournament_id=? AND user_id=?').get(t.id, interaction.user.id);
    if (used) return interaction.reply({ embeds: [infoEmbed('Boost Already Used', `You already purchased **+${used.points_added} points** for this tournament.`)], ephemeral: true });
    if (!eco.spend(interaction.guild.id, interaction.user.id, amount, `Tournament #${t.id} +${amount} points`, interaction.user.id)) {
      return interaction.reply({ embeds: [errorEmbed('Not Enough Power Tokens', `This boost costs **${amount} PT**. Your balance is **${eco.bal(interaction.guild.id, interaction.user.id)} PT**.`)], ephemeral: true });
    }
    db.transaction(() => {
      db.prepare('UPDATE tournament_players SET token_bonus_points=token_bonus_points+? WHERE tournament_id=? AND user_id=?').run(amount, t.id, interaction.user.id);
      db.prepare('INSERT INTO tournament_token_boosts(tournament_id,guild_id,user_id,tokens_spent,points_added,created_at) VALUES(?,?,?,?,?,?)').run(t.id, interaction.guild.id, interaction.user.id, amount, amount, Date.now());
    })();
    await interaction.reply({ embeds: [successEmbed('Tournament Boost Activated!', `💠 **+${amount} starting points** added to **${t.name}**.

**Balance:** ${eco.bal(interaction.guild.id, interaction.user.id)} PT`)], ephemeral: true });
    return updatePanel(client, q.byId.get(t.id));
  }

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
    await interaction.reply({ embeds: [successEmbed('Welcome to the Arena!', `You joined **${t.name}** as Roblox user **${username}**.\n\nUse the Power Token menu on the tournament panel to add starting points.`)], ephemeral: true });
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
    if (t.status !== 'active' || t.current_round !== 2) return interaction.reply({ content: '❌ Outfit submissions are not currently open.', ephemeral: true });
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
    await interaction.reply({ embeds: [infoEmbed('Left the Arena', `You left **${t.name}**. Any purchased tournament boost is not refunded.`)], ephemeral: true });
    return updatePanel(client, q.byId.get(t.id));
  }
}

module.exports = { handleCommand, handleInteraction };
