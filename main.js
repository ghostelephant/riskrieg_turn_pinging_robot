// IMPORTS --------------------------------------

require("dotenv").config();
const dayjs = require("dayjs");
const axios = require("axios");
const fs = require("fs");
const path = require("path");



// DATA -----------------------------------------

const apiUrl = process.env.DISCORD_API_URL;

const saveFileLocation = process.env.SAVE_FILE_LOCATION.split("/");

const serverWhitelist = process.env.SERVER_WHITELIST.split(",");

const headers = {
  Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
};

/* Create array for storing turn pings
(will then pull from this at the end
to post messages */
const turnPings = [];

/* Get a list of server IDs to scan 
(cross-reference available directories
with whitelisted servers in .env) */
const serverIds = fs.readdirSync(path.join(
  __dirname,
  ...saveFileLocation
))
  .filter(serverId =>
    serverWhitelist.includes(serverId)
  );



// HELPER FUNCTIONS -----------------------------

const isAllDigits = str => {
  const digits = "0123456789";
  for(let i=0; i<str.length; i++){
    if(!digits.includes(str[i])){
      return false;
    }
  }
  return true;
};

// Return hours since most recent channel message
const getChannelMessageTimestamp = async channelId => {
  // Get message data from Discord
  const lastMessage = await axios.get(
    `${apiUrl}/channels/${channelId}/messages`,
    {headers}
  ).then(rsp => rsp.data[0]);
  // Return the elapsed time (in hours) since last message
  return lastMessage ?
    hoursSinceLastMessage = (dayjs() - dayjs(lastMessage.timestamp)) / (1000 * 3600)
    :
    null;
};

// Send a message to a Discord channel
const sendMessage = async (channelId, content) => {
  await axios.post(
    `${apiUrl}/channels/${channelId}/messages`,
    {content},
    {headers}
  );
};



// BUSINESS-LOGIC-Y FUNCTIONS -------------------

const scanServer = async serverId => {
  // Get all the save files for current serverId
  const saveFiles = fs.readdirSync(path.join(
    __dirname,
    ...saveFileLocation,
    serverId
  ))
    .filter(f =>
      f.substring(f.length - 5) === ".json"
    )
    .map(f => f.substring(0, f.length - 5))
    .filter(f => isAllDigits(f));

  /* Scan through channels, and for any channel
  whose last message was >25 hours ago, push
  channelId and serverId to turnPings array */
  for(let channelId of saveFiles){
    const hoursSinceLastMessage = await getChannelMessageTimestamp(channelId);
    if(hoursSinceLastMessage > 25){
      turnPings.push({
        serverId,
        channelId
      });
    }
  }
};

const pingForTurn = async ({serverId, channelId}) => {
  const gameData = require(path.join(
    __dirname,
    ...saveFileLocation,
    serverId,
    channelId
  ));
  
  sendMessage(
    channelId,
    gameData.gameState === "SETUP" ?
      "Don't forget about this game (which is still in the setup phase)"
      :
      `<@${gameData.players[0]?.identity?.id}> friendly reminder ping`
  );
};



// MAIN FUNCTION --------------------------------

const main = async () => {
  for(let serverId of serverIds){
    await scanServer(serverId);
  }

  for(let channelId of turnPings){
    await pingForTurn(channelId);
  }
};

main();