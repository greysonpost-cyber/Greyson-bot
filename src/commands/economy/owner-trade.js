const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database/db');
const eco = require('../../services/economy');
const arts = require('../../services/artifacts');

function ownerIds() {
  return String(process.env.OWNER_IDS || process.env.OWNER_ID || '')
    .split(',').map(x => x.trim()).filter(Boolean);
}
function isOwner(i) { return i.guild?.ownerId === i.user.id || ownerIds().includes(i.user.id); }
function audit(guildId, actorId, targetId, action, artifactId, tokens, reason, beforeBalance, afterBalance) {
  db.prepare(`INSERT INTO owner_override_audit
    (guild_id,actor_id,target_id,action,artifact_id,tokens,reason,before_balance,after_balance,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(guildId, actorId, targetId, action, artifactId || null, tokens || 0, reason, beforeBalance, afterBalance, Date.now());
}
async function receipt(user, embed) { if (!user) return; await user.send({ embeds: [embed] }).catch(() => {}); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('owner-trade')
    .setDescription('Owner-only manual artifact and Power Token overrides')
    .addSubcommand(s => s.setName('artifact-for-tokens')
      .setDescription('Force-transfer an artifact and charge or pay a member')
      .addUserOption(o => o.setName('user').setDescription('Member affected').setRequired(true))
      .addIntegerOption(o => o.setName('artifact_id').setDescription('Artifact copy ID').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('direction').setDescription('Artifact transfer direction').setRequired(true).addChoices(
        { name: 'Give artifact to member', value: 'give' },
        { name: 'Take artifact from member', value: 'take' },
      ))
      .addIntegerOption(o => o.setName('tokens').setDescription('PT exchanged (0 allowed)').setRequired(true).setMinValue(0).setMaxValue(1000000))
      .addStringOption(o => o.setName('token_direction').setDescription('How PT moves').setRequired(true).addChoices(
        { name: 'Charge member', value: 'charge' },
        { name: 'Pay member', value: 'pay' },
        { name: 'No token transfer', value: 'none' },
      ))
      .addStringOption(o => o.setName('reason').setDescription('Required audit reason').setRequired(true).setMinLength(3).setMaxLength(180)))
    .addSubcommand(s => s.setName('transfer-artifact')
      .setDescription('Force-transfer an artifact to any member')
      .addIntegerOption(o => o.setName('artifact_id').setDescription('Artifact copy ID').setRequired(true).setMinValue(1))
      .addUserOption(o => o.setName('new_owner').setDescription('New owner').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Required audit reason').setRequired(true).setMinLength(3).setMaxLength(180)))
    .addSubcommand(s => s.setName('tokens')
      .setDescription('Set, add, or remove a member’s Power Tokens')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('action').setDescription('Balance action').setRequired(true).addChoices(
        { name: 'Set exact balance', value: 'set' }, { name: 'Add PT', value: 'add' }, { name: 'Remove PT', value: 'remove' },
      ))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(0).setMaxValue(1000000))
      .addStringOption(o => o.setName('reason').setDescription('Required audit reason').setRequired(true).setMinLength(3).setMaxLength(180))),

  async execute(i) {
    if (!isOwner(i)) return i.reply({ content: '❌ This command is restricted to the server/bot owner.', ephemeral: true });
    const sub = i.options.getSubcommand();
    const gid = i.guild.id;
    await i.deferReply({ ephemeral: true });

    if (sub === 'tokens') {
      const user = i.options.getUser('user'); const action = i.options.getString('action');
      const amount = i.options.getInteger('amount'); const reason = i.options.getString('reason');
      const before = eco.bal(gid, user.id);
      if (action === 'set') eco.add(gid, user.id, amount - before, `Owner override: ${reason}`, i.user.id);
      else if (action === 'add') eco.add(gid, user.id, amount, `Owner override: ${reason}`, i.user.id);
      else eco.add(gid, user.id, -Math.min(before, amount), `Owner override: ${reason}`, i.user.id);
      const after = eco.bal(gid, user.id);
      audit(gid, i.user.id, user.id, `tokens_${action}`, null, amount, reason, before, after);
      const e = new EmbedBuilder().setColor(0x7c3aed).setTitle('🛡️ Owner Balance Override')
        .setDescription(`${user}'s balance changed from **${before} PT** to **${after} PT**.`)
        .addFields({ name: 'Reason', value: reason }, { name: 'Operator', value: `${i.user}` }).setTimestamp();
      await receipt(user, e); return i.editReply({ embeds: [e] });
    }

    if (sub === 'transfer-artifact') {
      const id = i.options.getInteger('artifact_id'); const to = i.options.getUser('new_owner'); const reason = i.options.getString('reason');
      const a = arts.artifact(id); if (!a) return i.editReply('❌ Artifact not found.');
      const old = a.owner_id;
      db.prepare(`UPDATE marketplace_listings SET status='cancelled' WHERE artifact_id=? AND status='active'`).run(id);
      const result = await arts.transfer(i.guild, id, to.id, `Owner override: ${reason}`, i.user.id);
      audit(gid, i.user.id, to.id, 'transfer_artifact', id, 0, reason, null, null);
      const e = new EmbedBuilder().setColor(0xdc2626).setTitle('🕷️ Owner Artifact Transfer')
        .setDescription(`**${arts.label(a)}** moved from ${old ? `<@${old}>` : 'unowned stock'} to ${to}.`)
        .addFields({ name: 'Reason', value: reason }, { name: 'Transaction', value: result.txid }).setTimestamp();
      await receipt(to, e); if (old && old !== to.id) await receipt(await i.client.users.fetch(old).catch(() => null), e);
      return i.editReply({ embeds: [e] });
    }

    const user = i.options.getUser('user'); const id = i.options.getInteger('artifact_id');
    const direction = i.options.getString('direction'); const tokenDirection = i.options.getString('token_direction');
    const tokens = i.options.getInteger('tokens'); const reason = i.options.getString('reason');
    const a = arts.artifact(id); if (!a) return i.editReply('❌ Artifact not found.');
    if (direction === 'take' && a.owner_id !== user.id) return i.editReply(`❌ ${user} does not own **${arts.label(a)}**.`);
    if (direction === 'give' && a.owner_id === user.id) return i.editReply(`❌ ${user} already owns **${arts.label(a)}**.`);
    const before = eco.bal(gid, user.id);
    if (tokenDirection === 'charge' && before < tokens) return i.editReply(`❌ ${user} only has **${before} PT**; cannot charge **${tokens} PT**.`);

    const targetOwner = direction === 'give' ? user.id : null;
    db.prepare(`UPDATE marketplace_listings SET status='cancelled' WHERE artifact_id=? AND status='active'`).run(id);
    if (tokenDirection === 'charge' && tokens) eco.spend(gid, user.id, tokens, `Owner trade: ${reason}`, i.user.id);
    if (tokenDirection === 'pay' && tokens) eco.add(gid, user.id, tokens, `Owner trade: ${reason}`, i.user.id);
    const result = await arts.transfer(i.guild, id, targetOwner, `Owner trade: ${reason}`, i.user.id, direction === 'take' ? user.id : null);
    const after = eco.bal(gid, user.id);
    audit(gid, i.user.id, user.id, `artifact_for_tokens_${direction}_${tokenDirection}`, id, tokens, reason, before, after);
    const e = new EmbedBuilder().setColor(0xb91c1c).setTitle('⚠️ Owner Trade Override Completed')
      .setDescription(`${direction === 'give' ? `Gave **${arts.label(a)}** to ${user}` : `Removed **${arts.label(a)}** from ${user}`}.
${tokenDirection === 'charge' ? `Charged **${tokens} PT**.` : tokenDirection === 'pay' ? `Paid **${tokens} PT**.` : 'No PT moved.'}`)
      .addFields({ name: 'Balance', value: `${before} PT → **${after} PT**`, inline: true }, { name: 'Transaction', value: result.txid, inline: true }, { name: 'Reason', value: reason }).setTimestamp();
    await receipt(user, e); return i.editReply({ embeds: [e] });
  },
};
