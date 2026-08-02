DripCore Tournament Deployment Fix

Cause:
The tournament slash command had more than Discord's maximum of 25 top-level command options. Discord.js rejected the command while the bot was starting, causing Railway to stop the container.

Fix:
Roster/check-in commands are now grouped under /tournament roster.
Bracket commands are now grouped under /tournament bracket.

Upload the src folder into the root of your GitHub repository and replace matching files.
Then redeploy Railway and run npm run deploy once.

Updated command examples:
/tournament roster add
/tournament roster remove
/tournament roster checkin-open
/tournament roster checkin-close
/tournament bracket generate
/tournament bracket view
/tournament bracket shuffle
/tournament bracket edit
/tournament bracket approve
/tournament bracket unlock
