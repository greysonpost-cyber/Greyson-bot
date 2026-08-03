const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../database/db');
const { getConfig } = require('../../utils/config');

function active(gid) { return db.prepare(`SELECT * FROM tournaments WHERE guild_id=? AND status!='deleted' ORDER BY id DESC LIMIT 1`).get(gid); }
function canManage(i) {
  if (i.member.permissions.has(PermissionFlagsBits.Administrator) || i.member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const role = getConfig(i.guild.id, 'tournament_manager_role'); return Boolean(role && i.member.roles.cache.has(role));
}
function state(tid) { return db.prepare('SELECT * FROM tournament_round_state WHERE tournament_id=? AND round_number=4').get(tid); }
function sub(tid, uid) { return db.prepare('SELECT * FROM tournament_submissions WHERE tournament_id=? AND round_number=4 AND user_id=?').get(tid, uid); }
function imageAttachment(a) { return a && (a.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.name || a.url || '')); }

module.exports = {
  data: new SlashCommandBuilder().setName('round4').setDescription('Avatar Creator round submission dashboard')
    .addSubcommand(s => s.setName('open').setDescription('Manager: open Round 4 submissions')
      .addStringOption(o => o.setName('theme').setDescription('Avatar theme/challenge').setRequired(true).setMaxLength(100))
      .addIntegerOption(o => o.setName('minutes').setDescription('Submission time').setRequired(true).setMinValue(1).setMaxValue(1440)))
    .addSubcommand(s => s.setName('submit').setDescription('Submit or replace your Round 4 screenshot')
      .addAttachmentOption(o => o.setName('image').setDescription('Your avatar screenshot').setRequired(true))
      .addStringOption(o => o.setName('caption').setDescription('Optional short caption').setMaxLength(100)))
    .addSubcommand(s => s.setName('view').setDescription('Privately view your saved Round 4 submission'))
    .addSubcommand(s => s.setName('status').setDescription('Manager: view submitted and missing players'))
    .addSubcommand(s => s.setName('extend').setDescription('Manager: extend the deadline')
      .addIntegerOption(o => o.setName('minutes').setDescription('Minutes to add').setRequired(true).setMinValue(1).setMaxValue(1440)))
    .addSubcommand(s => s.setName('close').setDescription('Manager: close Round 4 submissions now')),

  async execute(i) {
    const t = active(i.guild.id); if (!t) return i.reply({ content: '❌ No tournament exists.', ephemeral: true });
    const action = i.options.getSubcommand();
    const managers = new Set(['open', 'status', 'extend', 'close']);
    if (managers.has(action) && !canManage(i)) return i.reply({ content: '❌ Tournament Managers only.', ephemeral: true });

    if (action === 'open') {
      const theme = i.options.getString('theme'); const deadline = Date.now() + i.options.getInteger('minutes') * 60000;
      db.prepare(`INSERT INTO tournament_round_state(tournament_id,round_number,theme,submission_deadline,voting_open,voting_closed,created_at)
        VALUES(?,4,?,?,0,0,?) ON CONFLICT(tournament_id,round_number) DO UPDATE SET theme=excluded.theme,submission_deadline=excluded.submission_deadline,voting_open=0,voting_closed=0`).run(t.id, theme, deadline, Date.now());
      return i.reply({ embeds: [new EmbedBuilder().setColor(0x8b1cfb).setTitle('🎭 Round 4 Submissions Open')
        .setDescription(`**Theme:** ${theme}\n**Deadline:** <t:${Math.floor(deadline/1000)}:F> (<t:${Math.floor(deadline/1000)}:R>)\n\n### How to submit\nUse \`/round4 submit\`, attach **one clear screenshot**, and optionally add a caption. The bot saves it instantly—no DM collector required.\n\nYou may run the command again before the deadline to replace your image.`)
        .setFooter({ text: 'Only the newest accepted submission counts' })] });
    }
    const rs = state(t.id);
    if (action === 'submit') {
      const p = db.prepare('SELECT * FROM tournament_players WHERE tournament_id=? AND user_id=? AND active=1').get(t.id, i.user.id);
      if (!p) return i.reply({ content: '❌ Only active tournament players can submit.', ephemeral: true });
      if (!rs?.submission_deadline) return i.reply({ content: '❌ Round 4 submissions have not opened.', ephemeral: true });
      if (Date.now() > rs.submission_deadline || rs.voting_open || rs.voting_closed) return i.reply({ content: '❌ Round 4 submissions are closed.', ephemeral: true });
      const a = i.options.getAttachment('image'); if (!imageAttachment(a)) return i.reply({ content: '❌ Attach a PNG, JPG, WEBP, or GIF image.', ephemeral: true });
      const caption = i.options.getString('caption') || null;
      db.prepare(`INSERT INTO tournament_submissions(tournament_id,round_number,user_id,image_url,caption,submitted_at) VALUES(?,4,?,?,?,?)
        ON CONFLICT(tournament_id,round_number,user_id) DO UPDATE SET image_url=excluded.image_url,caption=excluded.caption,submitted_at=excluded.submitted_at`).run(t.id, i.user.id, a.url, caption, Date.now());
      return i.reply({ embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle('✅ Round 4 Submission Saved')
        .setDescription(`**Theme:** ${rs.theme || 'Avatar Creator'}\nSaved <t:${Math.floor(Date.now()/1000)}:R>\nDeadline <t:${Math.floor(rs.submission_deadline/1000)}:R>\n\nRun \`/round4 submit\` again to replace it before closing.`).setImage(a.url)], ephemeral: true });
    }
    if (action === 'view') {
      const s = sub(t.id, i.user.id); if (!s) return i.reply({ content: '❌ You have not submitted yet.', ephemeral: true });
      return i.reply({ embeds: [new EmbedBuilder().setColor(0x6a00ff).setTitle('🎭 Your Round 4 Submission').setDescription(`${s.caption ? `**Caption:** ${s.caption}\n` : ''}Saved <t:${Math.floor(s.submitted_at/1000)}:R>`).setImage(s.image_url)], ephemeral: true });
    }
    if (action === 'extend') {
      if (!rs?.submission_deadline) return i.reply({ content: '❌ Round 4 is not open.', ephemeral: true });
      const deadline = Math.max(Date.now(), rs.submission_deadline) + i.options.getInteger('minutes') * 60000;
      db.prepare('UPDATE tournament_round_state SET submission_deadline=? WHERE tournament_id=? AND round_number=4').run(deadline, t.id);
      return i.reply(`✅ Round 4 extended to <t:${Math.floor(deadline/1000)}:F>.`);
    }
    if (action === 'close') {
      if (!rs?.submission_deadline) return i.reply({ content: '❌ Round 4 is not open.', ephemeral: true });
      db.prepare('UPDATE tournament_round_state SET submission_deadline=? WHERE tournament_id=? AND round_number=4').run(Date.now(), t.id);
      return i.reply('🔒 Round 4 submissions are now closed.');
    }
    const players = db.prepare('SELECT user_id FROM tournament_players WHERE tournament_id=? AND active=1 ORDER BY display_name').all(t.id);
    const submissions = db.prepare('SELECT user_id,submitted_at FROM tournament_submissions WHERE tournament_id=? AND round_number=4').all(t.id);
    const got = new Map(submissions.map(x => [x.user_id, x]));
    const yes = players.filter(x => got.has(x.user_id)).map(x => `✅ <@${x.user_id}>`).join('\n') || 'None';
    const no = players.filter(x => !got.has(x.user_id)).map(x => `❌ <@${x.user_id}>`).join('\n') || 'None';
    return i.reply({ embeds: [new EmbedBuilder().setColor(0xf59e0b).setTitle('📊 Round 4 Submission Status').addFields(
      { name: `Submitted (${submissions.length})`, value: yes.slice(0,1024), inline: true }, { name: `Missing (${players.length-submissions.length})`, value: no.slice(0,1024), inline: true },
    ).setFooter({ text: rs?.submission_deadline ? `Deadline: ${new Date(rs.submission_deadline).toLocaleString()}` : 'Not opened' })], ephemeral: true });
  },
};
