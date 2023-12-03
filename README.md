# Turn Pinging Robot

A script to ping players whose turn it is in Riskrieg.

### SETUP

Clone this repository to your server.  Then, create a .env file and include the following information:

- DISCORD_BOT_TOKEN: token for the bot you want to ping players (get this from the Discord developers portal)

- DISCORD_API_URL: Recommended URL is "https://discord.com/api/v10" (I like to keep this in my .env so it's easy to change if I need to)

- SAVE_FILE_LOCATION: The relative path from the root of this project to your saves folder.  Use ".." to indicate parent directory and "/" to separate directories.

- SERVER_WHITELIST: A comma-separated string with the servers you want this script to ping in.

See the `example.env` file for samples with info formatted properly.

Finally, install Node.js dependencies by running `yarn`.

### USAGE

Once set up properly, you just need to run `node main.js` to initiate a scan of all the servers in your whitelist.

Recommended use case is using something like `crontab` to schedule it to run once a day -- it only pings in channels where the last message was at least 25 hours before the current time, so if it runs at the same time every day, channels where this bot's pinging is the only activity would get pung every two days (since the last ping would be a message in that channel from about 24 hours previously).