const db = require('../database/db');
const crypto = require('crypto');

function type(id) {
  return db.prepare('SELECT * FROM artifact_types WHERE id=?').get(id);
}

function artifact(id) {
  return db.prepare(`SELECT a.*,t.name,t.collection_name,t.discord_role_id,t.theme,t.passive,t.rarity,t.max_copies
    FROM artifacts a JOIN artifact_types t ON t.id=a.type_id WHERE a.id=?`).get(id);
}

function ownsNamed(guildId, userId, name) {
  return Boolean(db.prepare(`SELECT 1 FROM artifacts a JOIN artifact_types t ON t.id=a.type_id
    WHERE t.guild_id=? AND a.owner_id=? AND lower(t.name)=lower(?) LIMIT 1`).get(guildId, userId, name));
}

function owned(guildId, userId) {
  return db.prepare(`SELECT a.*,t.name,t.collection_name,t.discord_role_id,t.theme,t.passive,t.rarity,t.max_copies
    FROM artifacts a JOIN artifact_types t ON t.id=a.type_id
    WHERE t.guild_id=? AND a.owner_id=? ORDER BY t.collection_name,t.name,a.copy_number`).all(guildId, userId);
}

async function syncRole(guild, userId, roleId) {
  if (!roleId || !userId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  const stillOwns = db.prepare(`SELECT COUNT(*) c FROM artifacts a JOIN artifact_types t ON t.id=a.type_id
    WHERE a.owner_id=? AND t.discord_role_id=?`).get(userId, roleId).c > 0;
  if (stillOwns && !member.roles.cache.has(roleId)) await member.roles.add(roleId, 'Artifact ownership').catch(() => {});
  if (!stillOwns && member.roles.cache.has(roleId)) await member.roles.remove(roleId, 'Artifact ownership transferred').catch(() => {});
}

function collectionProgress(guildId, userId, collectionName) {
  // The Punisher is an alternate completion path for Spider-Verse, not a fourth requirement.
  // A member completes Spider-Verse by owning the original three OR The Punisher alone.
  if (String(collectionName).trim().toLowerCase() === 'spider-verse') {
    const hasPunisher = ownsNamed(guildId, userId, 'The Punisher');
    const hasSpiderMan = ownsNamed(guildId, userId, 'Spider-Man');
    const hasWebSlinger = ownsNamed(guildId, userId, 'Web Slinger') || ownsNamed(guildId, userId, 'Web Swing');
    const hasFriendlyNeighborhood = ownsNamed(guildId, userId, 'Friendly Neighborhood');
    const originalOwned = [hasSpiderMan, hasWebSlinger, hasFriendlyNeighborhood].filter(Boolean).length;
    return {
      total: 3,
      owned: hasPunisher ? 3 : originalOwned,
      complete: hasPunisher || (hasSpiderMan && hasWebSlinger && hasFriendlyNeighborhood),
      alternateComplete: hasPunisher,
      requirements: { hasPunisher, hasSpiderMan, hasWebSlinger, hasFriendlyNeighborhood }
    };
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM artifact_types
    WHERE guild_id=? AND lower(collection_name)=lower(?)`).get(guildId, collectionName).c;
  const ownedTypes = db.prepare(`SELECT COUNT(DISTINCT t.id) c FROM artifact_types t
    JOIN artifacts a ON a.type_id=t.id
    WHERE t.guild_id=? AND lower(t.collection_name)=lower(?) AND a.owner_id=?`).get(guildId, collectionName, userId).c;
  return { total, owned: ownedTypes, complete: total > 0 && ownedTypes >= total };
}

async function syncCollectionReward(guild, userId, collectionName) {
  if (!guild || !userId || !collectionName) return null;
  const reward = db.prepare(`SELECT * FROM collection_rewards
    WHERE guild_id=? AND lower(collection_name)=lower(?)`).get(guild.id, collectionName);
  if (!reward) return null;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return null;
  const role = await guild.roles.fetch(reward.role_id).catch(() => null);
  if (!role) return { ...collectionProgress(guild.id, userId, collectionName), changed: false, roleMissing: true };

  const progress = collectionProgress(guild.id, userId, collectionName);
  let changed = false;
  if (progress.complete && !member.roles.cache.has(role.id)) {
    await member.roles.add(role, `Completed artifact collection: ${collectionName}`);
    changed = true;
  } else if (!progress.complete && reward.remove_if_incomplete && member.roles.cache.has(role.id)) {
    await member.roles.remove(role, `Artifact collection no longer complete: ${collectionName}`);
    changed = true;
  }
  return { ...progress, changed, roleMissing: false };
}

async function syncAllCollectionRewardsForUser(guild, userId) {
  if (!guild || !userId) return [];
  const rewards = db.prepare('SELECT collection_name FROM collection_rewards WHERE guild_id=?').all(guild.id);
  const results = [];
  for (const reward of rewards) {
    const result = await syncCollectionReward(guild, userId, reward.collection_name).catch(() => null);
    if (result) results.push({ collectionName: reward.collection_name, ...result });
  }
  return results;
}

async function syncCollectionMembers(guild, collectionName) {
  const reward = db.prepare(`SELECT * FROM collection_rewards
    WHERE guild_id=? AND lower(collection_name)=lower(?)`).get(guild.id, collectionName);
  if (!reward) return { checked: 0, granted: 0, removed: 0 };

  const ownerRows = db.prepare(`SELECT DISTINCT a.owner_id FROM artifacts a
    JOIN artifact_types t ON t.id=a.type_id
    WHERE t.guild_id=? AND lower(t.collection_name)=lower(?) AND a.owner_id IS NOT NULL`).all(guild.id, collectionName);
  const role = await guild.roles.fetch(reward.role_id).catch(() => null);
  const roleMembers = role ? [...role.members.keys()] : [];
  const userIds = [...new Set([...ownerRows.map(r => r.owner_id), ...roleMembers])];
  let granted = 0;
  let removed = 0;
  for (const userId of userIds) {
    const hadRole = role?.members.has(userId) || false;
    const result = await syncCollectionReward(guild, userId, collectionName).catch(() => null);
    if (!result?.changed) continue;
    if (result.complete && !hadRole) granted++;
    else if (!result.complete && hadRole) removed++;
  }
  return { checked: userIds.length, granted, removed };
}

async function transfer(guild, artifactId, to, reason, actor, fromExpected = null) {
  const a = artifact(artifactId);
  if (!a) throw new Error('Artifact not found');
  if (fromExpected && a.owner_id !== fromExpected) throw new Error('Current owner changed');
  const old = a.owner_id;
  const txid = 'TX-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  db.transaction(() => {
    db.prepare('UPDATE artifacts SET owner_id=?,obtained_at=?,trade_count=trade_count+1,locked_trade_id=NULL WHERE id=?').run(to, Date.now(), artifactId);
    db.prepare('INSERT INTO artifact_history(artifact_id,from_user_id,to_user_id,action,reason,transaction_id,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(artifactId, old, to, 'transfer', reason, txid, Date.now());
    db.prepare('UPDATE collection_preferences SET user_id=? WHERE artifact_id=?').run(to, artifactId);
  })();

  if (old) {
    await syncRole(guild, old, a.discord_role_id);
    await syncAllCollectionRewardsForUser(guild, old);
  }
  if (to) {
    await syncRole(guild, to, a.discord_role_id);
    await syncAllCollectionRewardsForUser(guild, to);
  }
  return { artifact: a, txid, old, to };
}

function label(a) {
  return `${a.name} #${String(a.copy_number).padStart(3, '0')}`;
}

module.exports = {
  type,
  artifact,
  owned,
  ownsNamed,
  transfer,
  syncRole,
  label,
  collectionProgress,
  syncCollectionReward,
  syncAllCollectionRewardsForUser,
  syncCollectionMembers
};
