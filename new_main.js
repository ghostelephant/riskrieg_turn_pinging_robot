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
const pingHistory = require("./pingHistory");

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

const newGamePingHistory = {
  playerId: "",
  lastTurn: null,
  pingCount: 1,
  isCurrent: true
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

// Get list of game saves from a server folder
const getChannelData = serverId => {
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
    }
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

const xpingForTurn = async ({serverId, channelId}) => {
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
    const serverChannels = getChannelData(serverId);
    const now = dayjs(new Date());
    serverChannels.forEach(channel => {
      const lastTurn = dayjs(channel.lastTurn * 1000);
      const hoursSinceLastTurn = (now - lastTurn) / 3600;
      if(hoursSinceLastTurn > 25){
        staleGames.push({...channel, hoursSinceLastTurn});
      }
    });
  }

  return staleGames;
};


const getPingData = game => {
  const hist = pingHistory[game.channelId] || {...newGamePingHistory};

  hist.playerId = game.currentPlayer;
  hist.isCurrent = true;
  if(game.lastTurn === hist.lastTurn){
    hist.pingCount++;
  }
  else{
    hist.pingCount = 1;
  }
  hist.lastTurn = game.lastTurn;
  hist.isCurrent = true;

  return hist;
};


const savePingHistory = () => {
  Object.keys(pingHistory).forEach(channelId => {
    if(pingHistory[channelId].isCurrent){
      pingHistory[channelId].isCurrent = false;
    }
    else{
      delete pingHistory[channelId];
    }
  });
  fs.writeFile(
    "./pingHistory.json",
    JSON.stringify(pingHistory, null, 2) || {},
    () => {}
  );
};




const getSwPerson = async id => {
  const personRsp = await axios.get(`https://swapi.dev/api/people/${id}`);
  return personRsp.data;
};

const pingAndDelay = async game => {
  const delay = timeoutPromise(1000);
  const message = pingForTurn(game);

  return Promise.all([delay, message])
    .then(([delay, message]) => {
      return {delay, message};
    });
};

const swAndDelay = async id => {
  const delay = timeoutPromise(1000);
  const person = getSwPerson(id);

  return Promise.all([delay, person])
    .then(([delay, person]) => {
      return person;
    });
}


// THE LOOP


// const someAsyncFunc = async id => {
//   const rsp = await fetch(`https://swapi.dev/api/people/${id}`);
//   const person = await rsp.json();
//   return person;
// }

// let nums = [1, 2, 3, 4, 5];

// (async function () {
//   for (let num of nums) {
//     console.log(new Date());
//     await (async function(){
//       console.log(await someAsyncFunc(num))
//     })();
//     // Expected output: 1

//     if(num >= 3) break; // Closes iterator, triggers return
//   }
// })();



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
    pingHistory[staleGame.channelId] = pingData;
    staleGame.pingCount = pingData.pingCount;
  });

  savePingHistory();

  pingAsyncLoop(staleGames);
};

main();



// const asyncLoop = async () => {
//   const nums = [1, 2, 3, 4, 5];

//   for(let num of nums){
//     const person = await swAndDelay(num);
//     console.log(dayjs().format("HH:mm:ss"));
//     console.log(person);
//   }
// };

// asyncLoop();
