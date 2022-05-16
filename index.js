// Import discord.js and create the client
const Discord = require('discord.js')
const client = new Discord.Client({ intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"], partials: ["CHANNEL"] });
const meeleDamage = 3;


let GmId;
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
    value: 5,
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
    //bot check
    if (msg.author.bot)
        return;

    //Arg setup and help handling
    var args = msg.content.split(' ');
    if (args[0] == '!help') {
        HandleHelpCommands(msg, ...args.slice(1));
        return;
    }
    
    //Only allow appropriate channels
    if(!(msg.channel.type == 'DM' || msg.channel.name == 'bb-game-setup' || msg.channel.name == 'bb-game-info')) {
        return;
    }
    
    //command handlers
    if (args[0] == '!gm') {
        HandleGMCommands(msg, ...args.slice(1));
    } else if (args[0] == '!p') {
        HandlePlayerCommands(msg, ...args.slice(1));
    }
    // // Check if the message starts with '!hello' and respond with 'world!' if it does.
    // if (msg.content.startsWith("!hello")) {
    //     sendHelloAfterDeley(msg);
    //     msg.reply('Hello, I hope you are having a wonderful day!')
    // }
});

async function sendHelloAfterDeley(msg) {
    await delayForSeconds(5);
    msg.reply('delayed Hello')
}

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
    } else if (command[0] == 'list') {
        List(msg, command.length < 2 ? null : command[1], command.length < 3 ? null : command[2]);
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
        Status(msg);
    } else if (command[0] == 'equip') {
        Equip(msg, command.length > 1 ? command[1] : null);
    } else if (command[0] == 'atack') {
        Attack(msg, command.length > 1 ? command[1] : null);
    }
}

function HandleHelpCommands(msg, ...command) {
    if(command.length == 0) {
        msg.reply(GetGeneralHelpString());
    } else if(command[0] == 'configuration') {
        msg.reply(GetConfigurationHelpString())
    } else if(command[0] == 'gameSetup') {
        msg.reply(GetGameSetupHelpString())
    } else if(command[0] == 'gameMaster') {
        msg.reply(GetGameMasterHelpString())
    } else if(command[0] == 'player') {
        msg.reply(GetPlayerHelpString())
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
            let reply = 'Possible ' + GetOpenLocationsString();
            reply += 'Possible ' + GetItemLookupListString();
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
        let reply = 'Possible' + GetPlayersString();
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
        let reply = 'Possible ' + GetOpenLocationsString();
        reply += ' | Possible ' + GetHazardListString();
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
        let reply = GetOpenLocationsString();
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
function List(msg, command, argument) {
    if (command == null) {
        let reply = 'Possible options: players, playerInfo (player name), locations, locationInfo (location name)';
        msg.reply(reply);
    } else if (command == 'players') {
        let reply = GetPlayersString();
        msg.reply(reply);
    } else if (command == 'playerInfo' && argument != null) {
        let player = players.find((x) => x.name = argument);
        if (player != null) {
            let reply = 'Status - ';
            reply += GetPlayerStatsString(player);
            reply += ' | ' + GetPlayerItemsString(player);
            msg.reply(reply);
        }
    } else if (command == 'locations') {
        let reply = GetOpenLocationsString();
        msg.reply(reply);
    } else if (command == 'locationInfo' && argument != null) {
        let location = locations.find((x) => { return x.name = argument })
        if (location != null) {
            let reply = 'Location Name: ' + location.name;
            reply += ' | ' + GetConnectedLocationsString(location);
            reply += ' | ' + GetLocationItemsString(location);
            reply += ' | ' + GetLocationPlayersString(location);
            msg.reply(reply);
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
            let reply = `Current Location:  ${currentLoc.name} | `
            reply += GetLocationItemsString(currentLoc) + ' | ';
            reply += GetConnectedLocationsString(currentLoc) + ' | ';
            reply += GetOtherPlayerListString(player);
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
                let reply = GetLocationItemsString(loc);
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
                let reply = GetConnectedLocationsString(loc);
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
                let reply = 'Droppable  ' + GetPlayerItemsString(player);
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
                let reply = 'Usable ' + GetPlayerUsableItemsString(player);
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
function Status(msg) {
    let id = msg.author.id;
    let player = players.find((x) => { return x.playerId == id })
    if (player != null) {
        let reply = 'Status - ';
        reply += GetPlayerStatsString(player);
        reply += ' | ' + GetPlayerItemsString(player);
        msg.reply(reply);
    }
}
function Equip(msg, target) {
    let id = GetUserId(msg);
    let player = players.find((x) => { return x.playerId == id });
    if (player != null) {
        if (target == null) {
            let reply = 'Equipable ' + GetPlayerEquipableItemsString(player);
            msg.reply(reply);
        }
        let itemName = player.inv.find((x) => { return x == target });
        if (itemName != null) {
            let itemInfo = itemLookup.find((x) => { return x.name == itemName });
            if (itemInfo != null) {
                if (itemInfo.type == 'weapon') {
                    player.equippedItem = itemInfo.name;
                }
            }
        }
    }
}
function Attack(msg, target) {
    let id = GetUserId(msg);
    let player = players.find((X) => { return X.playerId == id });
    if (player != null) {
        locationInfo = locations.find((x) => { return x.name == player.loc });
        if (locationInfo != null) {
            if (target == null) {
                filteredPlayers = players.filter((x) => { return x.loc == locationInfo.name && x.playerId != id });
                let reply = GetOtherPlayerListString(player);
                msg.reply(reply);
                return;
            }
            let otherPlayer = players.find((x)=> {return x.name == target});
            if(otherPlayer != null) {
                let canCounter = PlayerAttack(msg,player,otherPlayer);
                if(canCounter) {
                    if(Math.floor(Math.random() * 100) >= 10) {
                        PlayerAttack(msg,otherPlayer,player);
                    }
                }
            }
        }
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

function PlayerAttack(msg, attacker, target) {
    let equippedItemInfo = itemLookup.find((x)=>{return x.name == attacker.equippedItem});
    let canCounter = equippedItemInfo == null || equippedItemInfo.subType == 'melee';
    if(equippedItemInfo == null) {
        DamagePlayer(msg,target,meeleDamage);
    } else if(equippedItemInfo.subType == 'melee') {
        DamagePlayer(msg,target,equippedItemInfo.value);
    } else {
        let ammo = attacker.inv.find((x)=> x == equippedItemInfo.name + '-ammo');
        if(ammo != null) {
            DamagePlayer(msg,target,equippedItemInfo.value);
        }
    }
    return canCounter;
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

function delayForSeconds(sec) {
    return new Promise(resolve => setTimeout(resolve, sec * 1000));
}
//#endregion

//#region String Methods
function GetGeneralHelpString() {
    let reply = 'Battle Bot Info: This is a bot that facilitates a battle royal game with one game master and multiple players'
    reply += '\nFor innformation on specific commmands/setup use on of the following help commands';
    reply += '\n!help configuration'
    reply += '\n!help gameSetup'
    reply += '\n!help gameMaster'
    reply += '\n!help player'
    return reply;
}
function GetConfigurationHelpString() {
    let reply = 'This bot requires a few channels and roles to operate correctly. Please create the following.'
    reply += '\nChannels: bb-game-setup, bb-game-info';
    reply += '\nRoles: None'
    return reply;
}
function GetGameSetupHelpString() {
    let reply = 'The follow commands are used to setup a new Battle Bot game.'
    reply += `\n!gm setup - Initializes a new game and sets the command giver as the game's game master.`;
    reply += '\n!p enroll - Enrolls the user as a new player during the setup phase.';
    reply += '\n!gm start - Finishes the setup phase and start the actual game.';
    return reply;
}
function GetGameMasterHelpString() {
    let reply = 'The follow commands are used by the game master to operate the game.'
    reply += `\n!gm drop (item name) - Drop a item in a specified location.`;
    reply += '\n!gm kill (player name) - Remove a specified player from the game..';
    reply += '\n!gm hazard (hazard name) - Cause a hazard in a specified location.';
    reply += '\n!gm list (info type) - List information about the current game.';
    reply += '\n!gm end - Ends the current game.';
    return reply;  
}
function GetPlayerHelpString() {
    let reply = 'The follow commands are used by the player to play the game.'
    reply += `\n!p look - Displays the information for the current location the player is at..`;
    reply += '\n!p pickup - Pick up a item that is at your current location';
    reply += '\n!gm move - Move to a location that is connected to your current location.';
    reply += `\n!p use - Use a consumable item in your inventory.`;
    reply += '\n!p status - Displays the curretn status of your character.';
    reply += '\n!gm equip - Equip a weapon in your inventory.';
    reply += '\n!gm attack - Attack another player at your current location.';
    return reply;  
}
function GetOpenLocationsString() {
    var reply = 'Locations: ';
    let filteredLocations = locations.filter((x) => { return !x.closed })
    for (let i = 0; i < filteredLocations.length; i++) {
        reply += filteredLocations[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetConnectedLocationsString(loc) {
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
        reply = reply.slice(0, reply.length - 1)
    return reply
}
function GetLocationItemsString(location) {
    let reply = 'Items: ';
    if (location.items.length == 0) {
        reply += 'None'
    }
    for (let i = 0; i < location.items.length; i++) {
        reply += location.items[i] + ',';
    };
    if (reply.charAt(reply.length - 1) == ',')
        reply = reply.slice0, reply.length(-1)
    return reply
}
function GetLocationPlayersString(location) {
    let reply = 'Players: ';
    PlayerList = players.filter((x) => { return x.loc = location })
    if (PlayerList.length == 0) {
        reply += 'None';
    }
    for (let i = 0; i < PlayerList.length; i++) {
        reply += PlayerList[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetPlayersString() {
    let reply = 'Players:  ';
    for (let i = 0; i < players.length; i++) {
        reply += players[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
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
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
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
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetPlayerEquipableItemsString(player) {
    reply = 'Items: '
    var itemCount = 0
    for (let i = 0; i < player.inv.length; i++) {
        let itemInfo = itemLookup.find((x) => { return x.name == player.inv[i] });
        if (itemInfo.type == 'weapon') {
            reply += player.inv[i] + ',';
            itemCount++;
        }
    };
    if (itemCount == 0) {
        reply += 'None';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetPlayerStatsString(player) {
    reply = 'Health: ' + player.health;
    reply += '\nEnergy: ' + player.energy;
    reply += '\nLocation: ' + player.loc;
    reply += '\ntrait: ' + player.trait;
    reply += '\nWeight: ' + player.invWeight;
    reply += '\nEquipped Item: ' + player.equippedItem;
    return reply;
}
function GetItemLookupListString() {
    reply += 'Items: ';
    for (let i = 0; i < itemLookup.length; i++) {
        reply += itemLookup[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetOtherPlayerListString(player) {
    reply += 'Players: ';
    PlayerList = players.filter((x) => { return x.loc = player.loc && player.name != x.name })
    if (PlayerList.length == 0) {
        reply += 'None';
    }
    for (let i = 0; i < PlayerList.length; i++) {
        reply += PlayerList[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetHazardListString() {
    reply += 'Hazards: ';
    for (let i = 0; i < hazardLookup.length; i++) {
        reply += hazardLookup[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
//#endregion

// client.login logs the bot in and sets it up for use. You'll enter your token here.
client.login('OTczMzExNDM5ODE1MjA5MDAw.Gqfqbi.XDB3kiJyXV8b2LzjTp8hENQqyhMwqZlajhrcSE');