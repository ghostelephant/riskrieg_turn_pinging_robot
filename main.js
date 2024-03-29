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
const channelSkipList = process.env.CHANNEL_SKIP_LIST.split(",");
const headers = {
  Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
};

let pingHistory;
try{
  pingHistory = require("./pingHistory");
}
catch(e){
  pingHistory = {};
}

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

/* Sample data for a game not currently
saved to pingHistory, to be copied when
a new entry is needed */
const newGamePingHistory = {
  playerId: "",
  lastTurn: null,
  lastPing: null,
  pingCount: 1,
  isCurrent: true,
};


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

/* Get list of game saves from a server
folder and return relevant data */
const getGamesDataByServer = serverId => {
  const saveFiles = fs.readdirSync(path.join(
    __dirname,
    ...saveFileLocation,
    serverId
  ))
    .filter(f =>
      f.substring(f.length - 5) === ".json"
    )
    .map(f => f.substring(0, f.length - 5))
    .filter(f => isAllDigits(f))
    .filter(f => !channelSkipList.includes(f));

  return saveFiles.map(channelId => {
    const gameData = require(
      path.join(
        __dirname,
        ...saveFileLocation,
        serverId,
        channelId
      )
    );

    const lastTurn = gameData.lastUpdated.epochSecond;
    const currentPlayer = gameData.players[0].identity.id;
    const gameState = gameData.gameState;

    return {
      channelId,
      serverId,
      lastTurn,
      currentPlayer,
      gameState
    };
  });
};


// Send a message to a Discord channel
const sendMessage = async (channelId, content) => {
  const rsp = await axios.post(
    `${apiUrl}/channels/${channelId}/messages`,
    {content},
    {headers}
  )
    .catch(e => console.log(`Error posting to channel ${channelId}:\n${e}\n\n`));

  return rsp;
};

const timeoutPromise = (waitTimeInMs, shouldError) => {
  return new Promise((resolve, reject) => {
    const wait = setTimeout(() => {
      clearTimeout(wait);
      const message = `Promise ${shouldError ? "rejected" : "resolved"} after ${waitTimeInMs} ms`
      shouldError ?
        reject(message) : resolve(message);
    }, waitTimeInMs);
  });
};



// BUSINESS-LOGIC-Y FUNCTIONS -------------------

const findStaleGames = () => {
  const staleGames = [];
  for(let serverId of serverIds){
    const serverChannels = getGamesDataByServer(serverId);
    const now = dayjs(new Date());
    serverChannels.forEach(game => {
      const lastTurn = dayjs(game.lastTurn * 1000);
      const hoursSinceLastTurn = (now - lastTurn) / 3600000;
      if(hoursSinceLastTurn > 25){
        let shouldPing = false;
        const hist = pingHistory[game.channelId];
        const pungRecently = hist?.lastPing && ((now - dayjs(hist.lastPing)) / 3600000 < 25);
        
        if(!hist){
          shouldPing = true;
        }
        else if(!pungRecently){
          shouldPing = true;
        }
        if(shouldPing){
          staleGames.push({...game, hoursSinceLastTurn});
        }
        if(pungRecently){
          pingHistory[game.channelId].isCurrent = true;
        }
      }
    });
  }

  return staleGames;
};

const getPingData = game => {
  const hist = pingHistory[game.channelId] || {...newGamePingHistory};

  hist.playerId = game.currentPlayer;
  hist.isCurrent = true;
  if(game.lastTurn !== hist.lastTurn){
    hist.pingCount = 0;
  }
  hist.lastTurn = game.lastTurn;
  hist.lastPing = new Date();

  return hist;
};

const pingForTurn = async game => {
  let adjective = "friendly";
  if(game.pingCount === 2){
    adjective = "neutral";
  }
  else if(game.pingCount >= 3){
    adjective = "belligerent";
  }

  const rsp = await sendMessage(
    game.channelId,
    game.gameState === "SETUP" ?
      "Don't forget about this game (which is still in the setup phase)"
      :
      `<@${game.currentPlayer}> ${adjective} reminder ping`
  );
  return rsp;
};

const savePingHistory = () => {
  Object.keys(pingHistory).forEach(channelId => {
    if(pingHistory[channelId].isCurrent){
      delete pingHistory[channelId].isCurrent;
    }
    else{
      delete pingHistory[channelId];
    }
  });
  fs.writeFile(
    "./pingHistory.json",
    JSON.stringify(pingHistory, null, 2) || "{}",
    () => {}
  );
};

const pingAndDelay = async game => {
  const delay = timeoutPromise(1000);
  const message = pingForTurn(game);

  return Promise.all([delay, message])
    .then(([delay, message]) => {
      return {delay, message};
    });
};

const pingAsyncLoop = async staleGames => {
  for(let game of staleGames){
    const rsp = await pingAndDelay(game);
    console.log(dayjs().format("HH:mm:ss"));
    console.log(rsp);
  }
};




// MAIN FUNCTION --------------------------------

const main = async () => {
  const staleGames = findStaleGames();

  staleGames.forEach(staleGame => {
    const pingData = getPingData(staleGame);

    pingData.pingCount++;
    pingHistory[staleGame.channelId] = pingData;
    staleGame.pingCount = pingData.pingCount;
  });

  savePingHistory();

  pingAsyncLoop(staleGames);
};

main();