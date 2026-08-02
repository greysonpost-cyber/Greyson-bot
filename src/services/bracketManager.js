const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database/db');

function active(guildId) { return db.prepare("SELECT * FROM tournaments WHERE guild_id=? AND status!='deleted' ORDER BY id DESC LIMIT 1").get(guildId); }
function roster(tournamentId) { return db.prepare('SELECT * FROM tournament_players WHERE tournament_id=? AND active=1 ORDER BY joined_at').all(tournamentId); }
function matches(tournamentId, roundNumber) { return db.prepare('SELECT * FROM tournament_bracket_matches WHERE tournament_id=? AND round_number=? ORDER BY match_number').all(tournamentId, roundNumber); }
function state(tournamentId, roundNumber) { return db.prepare('SELECT * FROM tournament_bracket_state WHERE tournament_id=? AND round_number=?').get(tournamentId, roundNumber); }
function shuffle(values) { const a=[...values]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function generate(t, users) {
  const round=t.current_round || 2;
  const ordered=shuffle(users);
  const tx=db.transaction(()=>{
    db.prepare('DELETE FROM tournament_bracket_matches WHERE tournament_id=? AND round_number=?').run(t.id,round);
    db.prepare(`INSERT INTO tournament_bracket_state(tournament_id,round_number,status,version,updated_at) VALUES(?,?,'preview',1,?) ON CONFLICT(tournament_id,round_number) DO UPDATE SET status='preview',version=version+1,updated_at=excluded.updated_at`).run(t.id,round,Date.now());
    const ins=db.prepare(`INSERT INTO tournament_bracket_matches(tournament_id,round_number,match_number,player1_id,player2_id,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?)`);
    let number=1;
    for(let i=0;i<ordered.length;i+=2){const p1=ordered[i]?.user_id||null,p2=ordered[i+1]?.user_id||null;ins.run(t.id,round,number++,p1,p2,Date.now(),Date.now());}
  }); tx(); return matches(t.id,round);
}
function bracketText(t, rows) {
  if(!rows.length) return 'No bracket has been generated yet.';
  return rows.map(m => {
    if(m.player1_id && !m.player2_id) return `⭐ **Match ${m.match_number}:** <@${m.player1_id}> — **BYE**`;
    return `**Match ${m.match_number}:** ${m.player1_id?`<@${m.player1_id}>`:'TBD'} **vs** ${m.player2_id?`<@${m.player2_id}>`:'TBD'}${m.winner_id?`\n↳ ✅ Winner: <@${m.winner_id}>`:''}`;
  }).join('\n\n');
}
function previewEmbed(t, rows) {
  const s=state(t.id,t.current_round||2);
  return new EmbedBuilder().setColor(s?.status==='approved'?0x22c55e:0x8b1cfb)
   .setAuthor({name:'🏆 DRIPCORE • TOURNAMENT CONTROL'})
   .setTitle(`${s?.status==='approved'?'🔒 Official':'🛠️ Editable'} Bracket — Round ${t.current_round||2}`)
   .setDescription(`━━━━━━━━━━━━━━━━━━━━\n${bracketText(t,rows)}\n━━━━━━━━━━━━━━━━━━━━`)
   .addFields({name:'📌 Status',value:s?.status==='approved'?'Approved and locked. Use `/tournament bracket-unlock` before editing.':'Preview only. Remove no-shows, edit matchups, shuffle, then approve.'})
   .setFooter({text:`Tournament #${t.id} • Version ${s?.version||1}`}).setTimestamp();
}
function detailedGuide(t) {
 return new EmbedBuilder().setColor(0x6a00ff).setAuthor({name:'🕷️ DRIPCORE • DETAILED TOURNAMENT GUIDE'})
 .setTitle(`👗 ${t.name} — Dress to Impress Control Guide`)
 .setDescription('Every step below is saved. Managers can stop after any step and continue later without losing the bracket.')
 .addFields(
  {name:'1️⃣ Finalize the active roster',value:'Use `/tournament participants` to review signups. Use `/tournament roster-add` for an approved late player and `/tournament roster-remove` for a no-show. Removing a player here does not delete their history.'},
  {name:'2️⃣ Open check-in',value:'Use `/tournament checkin-open minutes:10`. Players press **I’m Ready**. The panel explains that checking in confirms attendance only—it does not start DTI or submit an outfit.'},
  {name:'3️⃣ Close check-in',value:'Use `/tournament checkin-close remove_absent:true` to automatically remove anyone who did not check in. Use `false` to keep absentees while you review them manually.'},
  {name:'4️⃣ Generate an editable bracket',value:'Use `/tournament bracket-generate`. The bot shuffles active players into written matchups such as **Greyson vs Vartx**. An odd player receives a bye. This is only a preview.'},
  {name:'5️⃣ Fix the bracket',value:'Use `/tournament bracket-edit match:1 player_one:@User player_two:@User`, `/tournament bracket-shuffle`, or the roster commands. Any edit returns the bracket to preview status.'},
  {name:'6️⃣ Approve and publish',value:'Use `/tournament bracket-approve`. The bracket becomes official and is posted in the tournament channel. Use `/tournament bracket-unlock` only before submissions begin if an emergency change is needed.'},
  {name:'7️⃣ Pick powers before the game',value:'Players privately choose **Shield (10 PT)**, **Double Points (5 PT)**, or no power. Only one power is allowed per game. `/tournament begin-round` locks all choices.'},
  {name:'8️⃣ Open DTI submissions',value:'Use `/tournament open-dti theme:<theme> minutes:<time>`. Players press **Submit Outfit**, receive private DM instructions, and may replace their image before the deadline.'},
  {name:'9️⃣ Handle missing submissions',value:'After the deadline, use `/tournament bracket-view` and the submission count. One submission means that player advances by default; neither submission requires a manager decision.'},
  {name:'🔟 Anonymous voting and results',value:'Use `/tournament open-dti-voting`. Votes stay private. When complete, use `/tournament close-dti-voting`. The bot records points and managers can advance winners in the bracket.'},
  {name:'➡️ Continue the tournament',value:'Review results, use `/tournament next-round`, and repeat the power-selection/start flow. The final rewards remain automatic: 1st 15 PT, 2nd 10 PT, 3rd 5 PT.'}
 ).setFooter({text:'DripCore • Managers can run /tournament guide at any time'});
}
async function publish(interaction,t){const rows=matches(t.id,t.current_round||2); const channel=interaction.guild.channels.cache.get(t.channel_id)||interaction.channel; const old=state(t.id,t.current_round||2); const msg=old?.message_id?await channel.messages.fetch(old.message_id).catch(()=>null):null; const payload={embeds:[previewEmbed(t,rows)]}; let sent=msg; if(msg) await msg.edit(payload); else sent=await channel.send(payload); db.prepare('UPDATE tournament_bracket_state SET message_id=?,channel_id=?,updated_at=? WHERE tournament_id=? AND round_number=?').run(sent.id,channel.id,Date.now(),t.id,t.current_round||2); return sent;}
module.exports={active,roster,matches,state,generate,previewEmbed,detailedGuide,publish,bracketText};
