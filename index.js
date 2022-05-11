// Import discord.js and create the client
const Discord = require('discord.js')
const client = new Discord.Client({ intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"], partials: ["CHANNEL"] });



let GmId;
let InfoChannelId;
let SpectatorChannelId;
let players = [];
let locations = [];
let gameState = 'none';
let itemLookup = [{
    name: 'bat',
    type: 'weapon',
    subType: 'melee',
    value: 10,
    weight: 1
},
{
    name: 'knife',
    type: 'weapon',
    subType: 'melee',
    value: 3,
    weight: .5
},
{
    name: 'pistol',
    type: 'weapon',
    subType: 'ranged',
    value: 10,
    weight: 1
},
{
    name: 'medkit',
    type: 'consumable',
    subType: 'health',
    value: 20,
    weight: .5
},
{
    name: 'food',
    type: 'consumable',
    subType: 'energy',
    value: 5,
    weight: .3
},
{
    name: 'pistol-ammo',
    type: 'consumable',
    subType: 'ammo',
    value: 1,
    weight: .1
}]
let hazardLookup = [{
    name: 'storm',
    value: '10'
}]

// Register an event so that when the bot is ready, it will log a messsage to the terminal
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
})

// Register an event to handle incoming messages
client.on('message', async msg => {
    if (msg.author.bot)
        return

    var args = msg.content.split(' ');
    if (args[0] == '!help') {
        return 'This will be the future help string'
    } else if (args[0] == '!gm') {
        HandleGMCommands(msg, ...args.slice(1));
    } else if (args[0] == '!p') {
        HandlePlayerCommands(msg, ...args.slice(1));
    }
    // Check if the message starts with '!hello' and respond with 'world!' if it does.
    if (msg.content.startsWith("!hello")) {
        msg.reply('Hello, I hope you are having a wonderful day!')
    }
});

//#region Command Handlers
function HandleGMCommands(msg, ...command) {
    if (command.length == 0)
        return;
    if (command[0] != 'setup') {
        if (GmId != GetUserId(msg)) {
            return;
        }
    }
    if (msg.channel.type == 'DM' &&
        (command[0] == 'setup' || command[0] == 'start' || command[0] == 'end')) {
        msg.reply('Please setup, start, and end the game using the main channel and not DMs')
        return;
    }
    if (msg.channel.type != 'DM' &&
        (command[0] == 'drop' || command[0] == 'pickup' ||
            command[0] == 'move' || command[0] == 'drop')) {
        msg.member.send('You should DM the bot to keep GM actions hidden')
        return;
    }

    if (command[0] == 'setup') {
        if (gameState == 'none') {
            StartSetup(msg.member);
        } else {
            msg.reply('Please end the game before starting a new one.')
        }
    } else if (command[0] == 'start') {
        if (gameState == 'setup' && players.length >= 1) {
            StartGame(msg);
        } else {
            msg.reply('Please finish setup with at least one player before starting game.')
        }
    } else if (command[0] == 'end') {
        EndGame();
        msg.reply('Game has been ended.')
    } else if (command[0] == 'drop') {
        DropSupplies(msg, command.length < 3 ? '' : command[1], command.length < 3 ? '' : command[2]);

    } else if (command[0] == 'kill') {
        KillPlayer(msg, command.length < 2 ? '' : command[1]);
    } else if (command[0] == 'hazard') {
        Hazard(msg, command.length < 3 ? '' : command[1], command.length < 3 ? '' : command[2]);
    } else if (command[0] == 'close') {
        Close(msg, command.length < 2 ? '' : command[1], command.length < 3 ? '' : command[2]);
    }
}

function HandlePlayerCommands(msg, ...command) {
    //Command Validation
    if (command.length == 0)
        return;
    if (command[0] != 'enroll') {
        let id = GetUserId(msg);
        let player = players.find((x) => { return x.playerId == id })
        if (player == null) {
            if (gameState == 'setup')
                msg.reply('Please use enroll command in the main chat to enroll as a player in the game.');
            else if (gameState == 'none')
                msg.reply('No game is in progress. Please start game setup before enrolling');
            else if (gameState == 'in-progress')
                msg.reply('Game is in progress. End the current game and start setup before enrolling');
            return;
        }
    }
    if (msg.channel.type == 'DM' &&
        (command[0] == 'enroll' || command[0] == 'leave')) {
        msg.reply('Please enroll using the main channel and not DMs')
        return;
    }
    if (msg.channel.type != 'DM' &&
        (command[0] == 'look' || command[0] == 'pickup' ||
            command[0] == 'move' || command[0] == 'drop')) {
        msg.member.send('You should DM the bot to keep your actions hidden')
        return;
    }

    //command handlers
    if (command[0] == 'enroll') {
        if (gameState == 'setup') {
            registerPlayer(msg.member);
        } else {
            msg.member.send('Game can not be joined at the moment')
        }
    } else if (command[0] == 'look') {
        PlayerLook(msg);
    } else if (command[0] == 'pickup') {
        PickUp(msg, command.length > 1 ? command[1] : '');
    } else if (command[0] == 'move') {
        Move(msg, command.length > 1 ? command[1] : '');
    } else if (command[0] == 'drop') {
        Drop(msg, command.length > 1 ? command[1] : '');
    } else if (command[0] == 'use') {
        Use(msg, command.length > 1 ? command[1] : '');
    } else if (command[0] == 'status') {
        status(msg);
    }
}
//#endregion

//#region GM Setup Stuff
function registerGM(member) {
    GmId = member.user.id;
    member.send('You have been selected to be the GM for the next game.')
}

function StartSetup(mem) {
    registerGM(mem)
    gameState = 'setup';
}

function StartGame(msg) {
    gameState = 'in-progress';
    //Locations
    let locCount = Math.floor(players.length / 2);
    let LocList = [];
    for (let i = 0; i <= locCount; i++) {
        let tempName = 'sector' + i;
        LocList.push(tempName);
        let connected = ['cornucopian'];
        if (i == 0) {
            connected.push('sector' + locCount - 1);
        } else {
            connected.push('sector' + (i - 1));
        }
        if (i + 1 == locCount) {
            connected.push('sector0');
        } else {
            connected.push('sector' + (i + 1));
        }
        locations.push({
            name: tempName,
            connectedLoc: connected,
            items: [],
            closed: false
        })
    }
    locations.push({
        name: 'cornucopian',
        connectedLoc: LocList,
        items: ['bat', 'knife', 'pistol', 'pistol-ammo', 'medkit', 'food'],
        closed: false
    })

    //Player Locations
    for (let i = 0; i < players.length; i++) {
        players[i].loc = 'sector' + Math.floor(i / 2);
    }

    msg.reply('The game has started');
}
//#endregion

//#region Player Setup Stuff
function registerPlayer(member) {
    players.push({
        playerId: member.user.id,
        name: member.user.username,
        health: 100,
        energy: 100,
        loc: 'none',
        trait: 'none',
        invWeight: 0,
        inv: [],
        equippedItem: 'none'
    })
    member.send('May the odds be ever in your favor.')
}

//#endregion

//#region GM Actions
function DropSupplies(msg, target, itemName) {
    let id = GetUserId(msg);
    if (id == GmId) {
        if (target == '') {
            let reply = 'Possible Locations for drop: ';
            for (let i = 0; i < locations.length; i++) {
                reply += locations[i].name;
                if (i + 1 != locations.length) {
                    reply += ', ';
                }
            }
            reply += ' | Possible Items for drop: ';
            for (let i = 0; i < itemLookup.length; i++) {
                reply += itemLookup[i].name;
                if (i + 1 != itemLookup.length) {
                    reply += ', ';
                }
            }
            msg.reply(reply);
            return;
        }
        let loc = locations.find((x) => { return x.name == target });
        let itemData = itemLookup.find((x) => { return x.name == itemName })
        if (loc != null && itemData != null) {
            loc.items.push(itemName);
        } else {
            msg.reply('Location or Item does not exist');
        }
    }
}
function KillPlayer(msg, target) {
    if (target == '') {
        let reply = 'Possible players to kill: ';
        for (let i = 0; i < players.length; i++) {
            reply += players[i].name;
        }
        msg.reply(reply);
        return;
    }
    let player = players.find((x) => { return x.name == target });
    if (player != null) {
        RemovePlayer(msg, player);
    }
}
function Hazard(msg, targetLocation, targetHazard) {
    if (targetLocation == '' || targetHazard == '') {
        let reply = 'Possible locations for hazard: ';
        for (let i = 0; i < locations.length; i++) {
            reply += locations[i].name;
            if (i + 1 != itemLookup.length) {
                reply += ', ';
            }
        }
        reply += ' | Possible hazards: '
        for (let i = 0; i < hazardLookup.length; i++) {
            reply += hazardLookup[i].name;
            if (i + 1 != hazardLookup.length) {
                reply += ', ';
            }
        }
        msg.reply(reply);
        return;
    }
    let loc = locations.find((x) => { return x.name == targetLocation });
    let hazardInfo = hazardLookup.find((x) => { return x.name == targetHazard });
    if (loc != null && hazardInfo != null) {
        let playerList = players.filter((x) => { return x.loc = loc.name });
        for (let i = 0; i < playerList.length; i++) {
            DamagePlayer(msg, playerList[i], hazardInfo.value);
        }
    }
}
function Close(msg, targetLocation, moveType) {
    if (targetLocation == '') {
        let reply = 'Possible locations to close: ';
        for (let i = 0; i < locations.length; i++) {
            reply += locations[i].name;
            if (i + 1 != itemLookup.length) {
                reply += ', ';
            }
        }
        msg.reply(reply);
        return;
    }
    let loc = locations.find((x) => { return x.name == targetLocation });
    if (loc != null) {
        let playerList = players.filter((x) => { return x.loc == loc.name });
        for (let i = 0; i < playerList.length; i++) {
            if (moveType == 'kill')
                RemovePlayer(msg, playerList[i]);
            else {
                playerList[i].loc = loc.connectedLoc[0];
                loc.closed = true;
                SendMessageToUserById(playerList[i].playerId, `Moved to location ${loc.connectedLoc[0]} due to location closing`)
            }
        }
    }
}
//#endregion

//#region Player Actions
function PlayerLook(msg) {
    let id = msg.author.id;
    let player = players.find((x) => { return x.playerId == id })
    if (player != null) {
        let currentLoc = locations.find(x => player.loc == x.name);
        if (currentLoc != null) {
            let reply = 'Current Location: ' + currentLoc.name
            reply += ' | Items: ';
            if (currentLoc.items.length == 0) {
                reply += 'None'
            }
            for (let i = 0; i < currentLoc.items.length; i++) {
                reply += currentLoc.items[i];
                if (i + 1 != currentLoc.items.length) {
                    reply += ', ';
                }
            };
            reply += ' | Connected Locations: ';
            if (currentLoc.connectedLoc.length == 0) {
                reply += 'None'
            }
            for (let i = 0; i < currentLoc.connectedLoc.length; i++) {
                reply += currentLoc.connectedLoc[i];
                if (i + 1 != currentLoc.connectedLoc.length) {
                    reply += ', ';
                }
            };
            let otherPlayers = players.filter((x) => { x.loc == currentLoc.name && x.playerId != player.playerId })
            reply += ' | Other Players: ';
            if (otherPlayers.length == 0) {
                reply += 'None'
            }
            for (let i = 0; i < otherPlayers.length; i++) {
                reply += otherPlayers[i];
                if (i + 1 != otherPlayers.length) {
                    reply += ', ';
                }
            };
            msg.reply(reply);
        }
    }
}
function PickUp(msg, target) {
    let id = msg.author.id;
    let player = players.find((x) => { return x.playerId == id })
    if (player != null) {
        let loc = locations.find((x) => { return x.name == player.loc });
        if (loc != null) {
            if (target == '') {
                let reply = 'Items possible to pick up: ';
                if (loc.items.length == 0) {
                    reply += 'None'
                }
                for (let i = 0; i < loc.items.length; i++) {
                    reply += loc.items[i];
                    if (i + 1 != loc.items.length) {
                        reply += ', ';
                    }
                };
                msg.reply(reply);
                return;
            }
            let itemName = loc.items.find((x) => { return x == target });
            if (itemName != null) {
                let item = itemLookup.find(x => x.name == itemName);
                if (item != null) {
                    if (player.invWeight + item.weight < 2) {
                        player.invWeight += item.weight;
                        player.inv.push(itemName);
                        loc.items = loc.items.filter(x => x != itemName)
                        msg.reply('Player picked up item: ' + item.name);
                    } else {
                        msg.reply('Not enough room in your inventory. Weight:' + item.weight + ' remaining weight: ' + 2 - player.invWeight)
                    }
                }
            } else {
                msg.reply('Item not at current location')
            }
        }
    }
}
function Move(msg, target) {
    let id = msg.author.id;
    let player = players.find((x) => { return x.playerId == id })
    if (player != null) {
        let loc = locations.find((x) => { return x.name == player.loc });
        if (loc != null) {
            if (target == '') {
                let reply = 'Possible areas to move to: ';
                if (loc.connectedLoc.length == 0) {
                    reply += 'None'
                }
                for (let i = 0; i < loc.connectedLoc.length; i++) {
                    locInfo = locations.find((x) => { return x.name == loc.connectedLoc[i] })
                    if (locInfo != null && !locInfo.closed) {
                        reply += loc.connectedLoc[i];
                    }
                };
                if (reply.charAt(reply.length - 1) == ',')
                    reply = reply.slice(-1)
                msg.reply(reply);
                return;
            }
            let newLocation = loc.connectedLoc.find((x) => { return x == target });
            if (newLocation != null) {
                player.loc = newLocation;
                msg.reply('Player moved to ' + newLocation);
            } else {
                msg.reply('No location with that name is available to move to')
            }
        }
    }
}
function Drop(msg, target) {
    let id = msg.author.id;
    let player = players.find((x) => { return x.playerId == id })
    if (player != null) {
        let loc = locations.find((x) => { return x.name == player.loc });
        if (loc != null) {
            if (target == '') {
                let reply = 'Items possible to drop: ';
                if (player.inv.length == 0) {
                    reply += 'None'
                }
                for (let i = 0; i < player.inv.length; i++) {
                    reply += player.inv[i];
                    if (i + 1 != player.inv.length) {
                        reply += ', ';
                    }
                };
                msg.reply(reply);
                return;
            }
            let itemName = player.inv.find((x) => { return x == target });
            if (itemName != null) {
                let itemInfo = itemLookup.find((x) => { return x.name = itemName });
                if (itemInfo != null) {
                    player.invWeight -= itemInfo.weight;
                    loc.items.push(itemName);
                    player.inv = player.inv.filter((x) => { return x != itemName });
                    if (player.equippedItem == itemName) {
                        player.equippedItem = 'none';
                    }
                }
            } else {
                msg.reply('You have no item with that name')
            }
        }
    }
}
function Use(msg, target) {
    let id = msg.author.id;
    let player = players.find((x) => { return x.playerId == id })
    if (player != null) {
        let loc = locations.find((x) => { return x.name == player.loc });
        if (loc != null) {
            if (target == '') {
                let reply = 'Items possible to use: ';
                if (player.inv.length == 0) {
                    reply += 'None'
                }
                for (let i = 0; i < player.inv.length; i++) {
                    reply += player.inv[i];
                    if (i + 1 != player.inv.length) {
                        reply += ', ';
                    }
                };
                msg.reply(reply);
                return;
            }
            let itemName = player.inv.find((x) => { return x == target });
            if (itemName != null) {
                let itemInfo = itemLookup.find((x) => { return x.name == itemName });
                if (itemInfo != null && itemInfo.type == 'consumable') {
                    if (itemInfo.subType == 'health') {
                        player.health = Math.min(itemInfo.value + player.health, 100);

                    } else if (itemInfo.subType == 'energy') {
                        player.energy = Math.min(itemInfo.value + player.energy, 100);
                    }
                    player.inv = player.inv.filter((x) => { return x != target });
                } else {
                    msg.reply('Item is not an item that can be used')
                }
            } else {
                msg.reply('You have no item with that name')
            }
        }
    }
}
function status(msg) {
    let id = msg.author.id;
    let player = players.find((x) => { return x.playerId == id })
    if (player != null) {
        let reply = 'Status';
        reply += ' - Health: ' + player.health;
        reply += ' | Energy: ' + player.energy;
        reply += ' | Location: ' + player.loc;
        reply += ' | trait: ' + player.trait;
        reply += ' | Weight: ' + player.invWeight;
        reply += ' | Equipped Item: ' + player.equippedItem;
        reply += ' | Items: ';
        if (player.inv.length == 0) {
            reply += 'None';
        }
        for (let i = 0; i < player.inv.length; i++) {
            reply += player.inv[i];
            if (i + 1 != player.inv.length) {
                reply += ', ';
            }
        };
        msg.reply(reply);
    }
}
//#endregion

//#region Helper methods
function RemovePlayer(msg, player) {
    SendMessageToUserById(player.playerId, 'You have been smited and are removed from the game')
    players = players.filter((x) => x.playerId != player.playerId)
    //TODO: Put message in the info channel
    if (players.length <= 1) {
        EndGame();
    }
}

function DamagePlayer(msg, player, damage) {
    player.health -= damage;
    SendMessageToUserById(player.playerId, `You have received ${damage} damage`)
    if (player.health <= 0) {
        RemovePlayer(msg, player)
    }
}

function SendMessageToUserById(id, message) {
    let user = client.users.cache.get(id);
    user.send(message);
}

function SendMessageToChannelById(id, message) {
    let channel = client.channels.cache.get(id);
    channel.send(message);
}

function EndGame() {
    //TODO: put End game message in info channel
    GmId = null;
    gameState = 'none';
    players = [];
    locations = [];
}

function GetUserId(msg) {
    return msg.mem == null ? msg.author == null ? '' : msg.author.id : msg.mem.user.id;
}

function GetLocationsString() {
    var reply = 'Locations: ';
    for (let i = 0; i < locations.length; i++) {
        reply += locations[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(-1);
    }
    return reply;
}
function GetConnectedLocationsString(location) {
    let reply = 'Connected Locations: ';
    if (loc.connectedLoc.length == 0) {
        reply += 'None'
    }
    for (let i = 0; i < loc.connectedLoc.length; i++) {
        locInfo = locations.find((x) => { return x.name == loc.connectedLoc[i] })
        if (locInfo != null && !locInfo.closed) {
            reply += loc.connectedLoc[i] + ',';
        }
    };
    if (reply.charAt(reply.length - 1) == ',')
        reply = reply.slice(-1)
    return reply
}
function GetLocationItemsString(location) {
    reply += 'Items: ';
    if (location.items.length == 0) {
        reply += 'None'
    }
    for (let i = 0; i < location.items.length; i++) {
        reply += location.items[i] + ',';
    };
    if (reply.charAt(reply.length - 1) == ',')
        reply = reply.slice(-1)
    return reply
}
function GetPlayersString() {
    let reply = 'Players:  ';
    for (let i = 0; i < players.length; i++) {
        reply += players[i].name + ',';
    }
    if (reply.charAt(reply.length - 1)) {
        reply = reply.slice(-1);
    }
    return reply;
}
function GetPlayerItemsString(player) {
    reply = 'Items: '
    if (player.inv.length == 0) {
        reply += 'None';
    }
    for (let i = 0; i < player.inv.length; i++) {
        reply += player.inv[i] + ',';
    };
    if (reply.charAt(reply.length - 1)) {
        reply = reply.slice(-1);
    }
    return reply;
}
function GetPlayerUsableItemsString(player) {
    reply = 'Items: '
    if (player.inv.length == 0) {
        reply += 'None';
    }
    for (let i = 0; i < player.inv.length; i++) {
        let itemInfo = itemLookup.find((x) => { return x.name == itemName });
        if (itemInfo.type == 'consumable' && itemInfo.subType != 'ammo') {
            reply += player.inv[i] + ',';
        }
    };
    if (reply.charAt(reply.length - 1)) {
        reply = reply.slice(-1);
    }
    return reply;
}
function GetPlayerStatsString(player) {
    reply = 'Health: ' + player.health;
    reply += ' | Energy: ' + player.energy;
    reply += ' | Location: ' + player.loc;
    reply += ' | trait: ' + player.trait;
    reply += ' | Weight: ' + player.invWeight;
    reply += ' | Equipped Item: ' + player.equippedItem;
    return reply;
}
function GetItemLookupList() {
    reply += 'Items: ';
    for (let i = 0; i < itemLookup.length; i++) {
        reply += itemLookup[i].name + ',';
    }
    if (reply.charAt(reply.length - 1)) {
        reply = reply.slice(-1);
    }
    return reply;
}
function GetOtherPlayerList(player) {
    reply += 'Players: ';
    PlayerList = players.filter((x) => { return x.loc = player.loc && player.name != x.name })
    if (PlayerList.length == 0) {
        reply += 'None';
    }
    for (let i = 0; i < PlayerList.length; i++) {
        reply += PlayerList[i].name + ',';
    }
    if (reply.charAt(reply.length - 1)) {
        reply = reply.slice(-1);
    }
    return reply;
}
//#endregion

// client.login logs the bot in and sets it up for use. You'll enter your token here.
client.login('OTczMzExNDM5ODE1MjA5MDAw.Gqfqbi.XDB3kiJyXV8b2LzjTp8hENQqyhMwqZlajhrcSE');