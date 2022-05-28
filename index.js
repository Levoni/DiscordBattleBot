// Import discord.js and create the client
const Discord = require('discord.js')
const client = new Discord.Client({ intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"], partials: ["CHANNEL"] });
const meeleDamage = 3;

let AllPlayers = {};
let games = {};
let basicItemLookup = [{
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
let basicHazardLookup = [{
    name: 'storm',
    value: '10'
}, {
    name: 'flood',
    value: '20'
}, {
    name: 'fire',
    value: 30
}]
let basicEnergyCostLookup = [{
    name: 'move',
    cost: 20
},
{
    name: 'look',
    cost: 10
},
{
    name: 'pickup',
    cost: 10
},
{
    name: 'drop',
    cost: 10
},
{
    name: 'use',
    cost: 10
},
{
    name: 'status',
    cost: 5
},
{
    name: 'equip',
    cost: 5
},
{
    name: 'attack',
    cost: 30
},
{
    name: 'autofill possibilities',
    cost: 2
}]
let basicTraitLookup = ['boxer', 'nurse', 'sharpshooter', 'runner', 'martialArtist']

// Register an event so that when the bot is ready, it will log a messsage to the terminal
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
})

// Register an event to handle incoming messages
client.on('message', async msg => {
    //bot check
    if (msg.author.bot)
        return;

    //Only allow appropriate channels
    if (!(msg.channel.type == 'DM' || msg.channel.name == 'bb-game-setup' || msg.channel.name == 'bb-game-info')) {
        return;
    }
    if(msg.channel.name == 'bb-game-info' && !msg.member.roles.cache.find((x) => {return x.name == 'BBGM'})) {
        msg.delete()
        return;
    }

    //Arg setup and help handling
    var args = msg.content.split(' ');
    if (args[0] == '!help') {
        HandleHelpCommands(msg, ...args.slice(1));
        return;
    }
    
    //command handlers
    if (args[0] == '!gm') {
        HandleGMCommands(msg, ...args.slice(1));
    } else if (args[0] == '!p') {
        HandlePlayerCommands(msg, ...args.slice(1));
    }
});

async function sendHelloAfterDeley(msg) {
    await delayForSeconds(5);
    msg.reply('Delayed Hello')
}

//#region Command Handlers
function HandleGMCommands(msg, ...command) {
    //Validate we have commands to use
    if (command.length == 0)
        return;

    //Validate commands are gomming from proper channel
    if ((msg.channel.name != 'bb-game-setup') &&
        (command[0] == 'setup' || command[0] == 'start' || command[0] == 'end')) {
        msg.reply('Please setup, start, and end the game using the bb-game-setup channel and not DMs')
        return;
    }
    if (msg.channel.type != 'DM' &&
        (command[0] == 'drop' || command[0] == 'kill' ||
            command[0] == 'hazard' || command[0] == 'close' ||
            command[0] == 'list')) {
        msg.member.send('You should DM the bot to keep GM actions hidden')
        return;
    }

    //Get current info for player and game
    var serverGame = games[GetServerId(msg)];
    var player = AllPlayers[GetUserId(msg)]
    var playerGame = player ? games[player.ServerId] : null;

    //Handle setup command and validation for existing game and player
    if (command[0] == 'setup') {
        if (!player && !serverGame) {
            StartSetup(msg);
        } else {
            msg.reply('Either you are in a game or the server already has a game running. You can not create a new game due to this.')
        }
    } else {
        if (player && playerGame) {// && player.playerType == 'GM') {
            if (command[0] == 'start') {
                if (playerGame.gameState == 'setup' && playerGame.players.length >= 1) {
                    StartGame(msg);
                } else {
                    msg.reply('Please finish game setup with at least one player before starting a game.')
                }
            } else if (command[0] == 'end') {
                EndGame(msg, playerGame);
            } else if (command[0] == 'drop') {
                DropSupplies(msg, playerGame, command.length < 3 ? '' : command[1], command.length < 3 ? '' : command[2]);
            } else if (command[0] == 'kill') {
                KillPlayer(msg, playerGame, command.length < 2 ? '' : command[1]);
            } else if (command[0] == 'hazard') {
                Hazard(msg, playerGame, command.length < 3 ? '' : command[1], command.length < 3 ? '' : command[2]);
            } else if (command[0] == 'close') {
                Close(msg, playerGame, command.length < 2 ? '' : command[1], command.length < 3 ? '' : command[2]);
            } else if (command[0] == 'list') {
                List(msg, playerGame, command.length < 2 ? null : command[1], command.length < 3 ? null : command[2]);
            }
        }
    }
}

function HandlePlayerCommands(msg, ...command) {
    //Command Validation
    if (command.length == 0)
        return;

    //Get current info for player and game
    var serverGame = games[GetServerId(msg)];
    var player = AllPlayers[GetUserId(msg)]
    var playerGame = player ? games[player.ServerId] : null;

    //Check message origin
    if (msg.channel.type == 'DM' &&
        (command[0] == 'enroll' || command[0] == 'leave')) {
        msg.reply('Please enroll using the main channel and not DMs')
        return;
    }
    if (msg.channel.type != 'DM' &&
        (command[0] == 'look' || command[0] == 'pickup' ||
            command[0] == 'move' || command[0] == 'drop' ||
            command[0] == 'use' || command[0] == 'status' ||
            command[0] == 'equip' || command[0] == 'attack' ||
            command[0] == 'selectTrait')) {
        msg.member.send('You should DM the bot to keep your actions hidden.')
        return;
    }

    //Enrolling feedback
    if (command[0] == 'enroll') {
        // if (playerGame == null) {
        if (!serverGame) {
            msg.reply('No game is in progress. Please start game setup before enrolling.');
        } else if (serverGame.gameState == 'setup')
            registerPlayer(msg.member, serverGame);
        else if (serverGame.gameState == 'in-progress')
            msg.reply('A Game is in progress. End the current game and start setup before enrolling.');
        return;
    }
    // else {
    //     msg.reply('You are already involved in another game')
    // }
    // }
    if (player && playerGame) {// && player.playerType == 'P') {
        //command handlers
        if (command[0] == 'selectTrait') {
            selectTrait(msg, playerGame, command.length > 1 ? command[1] : null);
        } else if (command[0] == 'look') {
            PlayerLook(msg, playerGame);
        } else if (command[0] == 'pickup') {
            PickUp(msg, playerGame, command.length > 1 ? command[1] : null);
        } else if (command[0] == 'move') {
            Move(msg, playerGame, command.length > 1 ? command[1] : null);
        } else if (command[0] == 'drop') {
            Drop(msg, playerGame, command.length > 1 ? command[1] : null);
        } else if (command[0] == 'use') {
            Use(msg, playerGame, command.length > 1 ? command[1] : null);
        } else if (command[0] == 'status') {
            Status(msg, playerGame);
        } else if (command[0] == 'equip') {
            Equip(msg, playerGame, command.length > 1 ? command[1] : null);
        } else if (command[0] == 'attack') {
            Attack(msg, playerGame, command.length > 1 ? command[1] : null);
        }
    }
}

function HandleHelpCommands(msg, ...command) {
    if (command.length == 0) {
        msg.reply(GetGeneralHelpString());
    } else if (command[0] == 'configuration') {
        msg.reply(GetConfigurationHelpString())
    } else if (command[0] == 'gameSetup') {
        msg.reply(GetGameSetupHelpString())
    } else if (command[0] == 'gameMaster') {
        msg.reply(GetGameMasterHelpString())
    } else if (command[0] == 'player') {
        msg.reply(GetPlayerHelpString())
    } else if (command[0] == 'energy') {
        let memServerId = GetServerId(msg);
        let gameServerId = AllPlayers[GetUserId(msg)] ? AllPlayers[GetUserId(msg)].ServerId : null;
        let ServerId = memServerId ? memServerId : gameServerId;
        msg.reply(GetEnergyHelpString(ServerId))
    }
}
//#endregion

//#region GM Setup Stuff
function registerGM(msg) {
    let role = msg.guild.roles.cache.find((r) => { return r.name == 'BBGM' })
    if (role) {
        role.members.forEach((member, i) => {
            member.roles.remove(role);
        })
        msg.member.roles.add(role);
    } else {
        msg.reply('Could not start a game because the required role "BBGM" has not in the server.')
        return;
    }
    GmId = msg.member.user.id;
    ServerId = msg.guildId;
    let newGame = new Game(GmId, ServerId);
    games[ServerId] = newGame;
    AllPlayers[GetUserId(msg)] = {ServerId: ServerId, playerType: 'GM'};
    newGame.gameState = 'setup';
    msg.member.send('You have been selected to be the GM for the next game.')
}

function StartSetup(mem) {
    registerGM(mem)
}

function StartGame(msg) {
    let currentGame = games[msg.guildId];
    currentGame.gameState = 'in-progress';

    //Location generation
    createBasicLevel(currentGame);

    //Player Locations
    for (let i = 0; i < currentGame.players.length; i++) {
        currentGame.players[i].loc = 'sector' + Math.floor(i / 2);
    }

    //Kick off continuous energy regen
    RegenEnergy(currentGame);

    SendMessageToBBInfoChannel(currentGame.ServerId, 'The Game has started.')
}
//#endregion

//#region Player Setup Stuff
function registerPlayer(member, currentGame) {
    var player = new Player(member);
    currentGame.players.push(player);
    AllPlayers[player.playerId] = {ServerId: currentGame.ServerId, playerType: 'P'};
    member.send('May the odds be ever in your favor.')
}
function selectTrait(msg, game, trait) {
    if (game.gameState == 'setup') {
        let id = GetUserId(msg);
        let player = game.players.find((x) => { return x.playerId == id });
        if (player != null) {
            if (trait == null) {
                msg.reply(GetTraitsString())
                return;
            }
            let traitInfo = basicTraitLookup.find((x) => { return x == trait });
            if (traitInfo != null) {
                player.trait = traitInfo;
                if (traitInfo == 'runner') {
                    player.energy = 120;
                } else {
                    player.energy = 100;
                }
                msg.reply(`You have selected the trait: ${traitInfo}.`)
            } else {
                msg.reply('No trait with that name is available for selecting.')
            }
        }
    } else {
        msg.reply('A Game is not in the setup phase, so you can not select a trait.');
    }
}
//#endregion

//#region Level setup
function createBasicLevel(game) {
    let locCount = Math.floor(game.players.length / 2);
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
        game.locations.push(new Location(tempName, game, { itemsToAdd: [], connectedLocations: connected }));
    }
    let itemsToAdd = ['bat', 'knife', 'pistol', 'pistol-ammo', 'medkit', 'food'];
    game.locations.push(new Location('cornucopian', game, { itemsToAdd: itemsToAdd, connectedLocations: LocList }));
}
//#endregion

//#region GM Actions
function DropSupplies(msg, currentGame, target, itemName) {
    let id = GetUserId(msg);
    if (id == GmId) {
        if (target == '') {
            let reply = `Possible ${GetOpenLocationsString(currentGame)}`;
            reply += `\nPossible ${GetItemLookupListString(currentGame)}`;
            msg.reply(reply);
            return;
        }
        let loc = currentGame.locations.find((x) => { return x.name == target });
        let itemData = currentGame.itemLookup.find((x) => { return x.name == itemName })
        if (loc != null && itemData != null) {
            loc.items.push(itemData);
            SendMessageToBBInfoChannel(currentGame.ServerId, `${itemName} has dropped at ${loc.name}`)
            msg.reply(`You have dropped item: ${itemData.name} at location: ${loc.name}.`)
        } else {
            msg.reply('Location or Item does not exist.');
        }
    }
}
function KillPlayer(msg, currentGame, target) {
    if (target == '') {
        let reply = `Possible ${GetPlayersString(currentGame)}`;
        msg.reply(reply);
        return;
    }
    let player = currentGame.players.find((x) => { return x.name == target });
    if (player != null) {
        RemovePlayer(msg, currentGame, player);
    }
}
function Hazard(msg, game, targetLocation, targetHazard) {
    if (targetLocation == '' || targetHazard == '') {
        let reply = `Possible ${GetOpenLocationsString(game)}`;
        reply += `\nPossible ${GetHazardListString(game)}`;
        msg.reply(reply);
        return;
    }
    let loc = game.locations.find((x) => { return x.name == targetLocation });
    let hazardInfo = game.hazardLookup.find((x) => { return x.name == targetHazard });
    if (loc != null && hazardInfo != null) {
        let playerList = game.players.filter((x) => { return x.loc = loc.name });
        SendMessageToBBInfoChannel(game.ServerId, `A ${hazardInfo.name} has struck ${loc.name}`);
        msg.reply(`Hazard: ${hazardInfo.name} has hit ${playerList.length} players at location: ${loc.name}.`)
        for (let i = 0; i < playerList.length; i++) {
            DamagePlayer(msg, game, playerList[i], hazardInfo.value, hazardInfo.name);
        }
    }
}
function Close(msg, game, targetLocation, moveType) {
    if (targetLocation == '') {
        let reply = GetOpenLocationsString(game);
        msg.reply(reply);
        return;
    }
    let loc = game.locations.find((x) => { return x.name == targetLocation });
    if (loc != null) {
        SendMessageToBBInfoChannel(game.ServerId, `Location ${loc.name} was closed.`)
        let playerList = game.players.filter((x) => { return x.loc == loc.name });
        for (let i = 0; i < playerList.length; i++) {
            if (moveType == 'kill')
                RemovePlayer(msg, game, playerList[i]);
            else {
                playerList[i].loc = loc.connectedLoc[0];
                loc.closed = true;
                SendMessageToUserById(playerList[i].playerId, `Moved to location ${loc.connectedLoc[0]} due to the location closing.`)
            }
        }
    } else {
        msg.reply(`Location: ${targetLocation} does not exist.`)
    }
}
function List(msg, game, command, argument) {
    if (command == null) {
        let reply = 'Possible options:';
        reply += '\n     players'
        reply += '\n     playerInfo (player name)'
        reply += '\n     locations'
        reply += '\n     locationInfo (location name)'
        msg.reply(reply);
    } else if (command == 'players') {
        let reply = GetPlayersString(game);
        msg.reply(reply);
    } else if (command == 'playerInfo' && argument != null) {
        let player = game.players.find((x) => x.name = argument);
        if (player != null) {
            let reply = 'Status:';
            reply += `\n${GetPlayerStatsString(player)}`;
            reply += `\n${PGetPlayerItemsString(player)}`;
            msg.reply(reply);
        }
    } else if (command == 'locations') {
        let reply = GetOpenLocationsString(game);
        msg.reply(reply);
    } else if (command == 'locationInfo' && argument != null) {
        let location = game.locations.find((x) => { return x.name = argument })
        if (location != null) {
            let reply = 'Location Name: ' + location.name;
            reply += `\n'${GetLocationItemsString(location)}`;
            reply += `\n${GetConnectedLocationsString(location, game)}`;
            reply += `\n${GetLocationPlayersString(location, game)}`;
            msg.reply(reply);
        }
    }
}
//#endregion

//#region Player Actions
function PlayerLook(msg, game) {
    let id = GetUserId(msg);
    let player = game.players.find((x) => { return x.playerId == id })
    if (player != null) {
        let currentLoc = game.locations.find((x) => { return player.loc == x.name });
        if (currentLoc != null) {
            if (!HandleEnergyRequirements(msg, game, player, 'look')) {
                return;
            }
            let reply = `Current Location:  ${currentLoc.name}`
            reply += `\n${GetLocationItemsString(currentLoc)}`;
            reply += `\n${GetConnectedLocationsString(currentLoc, game)}`;
            reply += `\n${GetOtherPlayerListString(player, game)}`;
            msg.reply(reply);
        }
    }
}
function PickUp(msg, game, target) {
    let id = GetUserId(msg);
    let player = game.players.find((x) => { return x.playerId == id })
    if (player != null) {
        let loc = game.locations.find((x) => { return x.name == player.loc });
        if (loc != null) {
            if (target == null) {
                if (!HandleEnergyRequirements(msg, game, player, 'autofill possibilities')) {
                    return;
                }
                let reply = GetLocationItemsString(loc);
                msg.reply(reply);
                return;
            }
            let item = loc.items.find((x) => { return x.name == target });
            if (item != null) {
                if (!HandleEnergyRequirements(msg, game, player, 'pickup')) {
                    return;
                }
                if (player.invWeight + item.weight < 2) {
                    player.invWeight += item.weight;
                    player.inv.push(item);
                    RemoveItemFromLocation(loc, item.name);
                    msg.reply('Picked up item: ' + item.name);
                } else {
                    msg.reply(`Not enough room in your inventory. Item weight: ${item.weight} remaining weight: ${2 - player.invWeight}.`)
                }
            } else {
                msg.reply('Item does not exist at your current location.')
            }
        }
    }
}
function Move(msg, game, target) {
    let id = GetUserId(msg);
    let player = game.players.find((x) => { return x.playerId == id })
    if (player != null) {
        let loc = game.locations.find((x) => { return x.name == player.loc });
        if (loc != null) {
            if (target == null) {
                if (!HandleEnergyRequirements(msg, game, player, 'autofill possibilities')) {
                    return;
                }
                let reply = GetConnectedLocationsString(loc, game);
                msg.reply(reply);
                return;
            }
            let newLocation = loc.connectedLoc.find((x) => { return x == target });
            if (newLocation != null) {
                if (!HandleEnergyRequirements(msg, game, player, 'move')) {
                    return;
                }
                player.loc = newLocation;
                msg.reply(`Moved to ${newLocation}.`);
            } else {
                msg.reply('No location with that name is available to move to.')
            }
        }
    }
}
function Drop(msg, game, target) {
    let id = GetUserId(msg);
    let player = game.players.find((x) => { return x.playerId == id })
    if (player != null) {
        let loc = game.locations.find((x) => { return x.name == player.loc });
        if (loc != null) {
            if (target == null) {
                if (!HandleEnergyRequirements(msg, game, player, 'autofill possibilities')) {
                    return;
                }
                let reply = `Droppable ${GetPlayerItemsString(player)}`;
                msg.reply(reply);
                return;
            }
            let itemInfo = game.itemLookup.find((x) => { return x.name = target });
            if (itemInfo != null) {
                if (!HandleEnergyRequirements(msg, game, player, 'drop')) {
                    return;
                }
                player.invWeight -= itemInfo.weight;
                loc.items.push(itemInfo);
                RemoveItemFromPlayer(player, itemInfo.name);
                msg.reply(`You have dropped item ${itemInfo.name}.`)
                if (player.equippedItem == itemInfo.name) {
                    player.equippedItem = 'none';
                }
            } else {
                msg.reply('You have no item with that name.')
            }
        }
    }
}
function Use(msg, game, target) {
    let id = GetUserId(msg);
    let player = game.players.find((x) => { return x.playerId == id })
    if (player != null) {
        let loc = game.locations.find((x) => { return x.name == player.loc });
        if (loc != null) {
            if (target == null) {
                if (!HandleEnergyRequirements(msg, game, player, 'autofill possibilities')) {
                    return;
                }
                let reply = `Usable ${GetPlayerUsableItemsString(player, game)}`;
                msg.reply(reply);
                return;
            }
            let itemInfo = game.itemLookup.find((x) => { return x.name == target });
            if (itemInfo != null) {
                if (itemInfo.type == 'consumable') {
                    if (!HandleEnergyRequirements(msg, game, player, 'use')) {
                        return;
                    }
                    if (itemInfo.subType == 'health') {
                        if (player.trait == 'nurse') {
                            player.health = Math.min(itemInfo.value + 5 + player.health, 100);
                        } else {
                            player.health = Math.min(itemInfo.value + player.health, 100);
                        }
                        msg.reply(`You used item ${itemInfo.name}. Current Health: ${player.health}.`);
                    } else if (itemInfo.subType == 'energy') {
                        player.energy = Math.min(itemInfo.value + player.energy, 100);
                        msg.reply(`You used item ${itemInfo.name}. Current Energy: ${player.energy}.`);
                    }
                    RemoveItemFromPlayer(player, itemInfo.name);
                } else {
                    msg.reply('The item is not a usable item.')
                }
            } else {
                msg.reply('You have no item with that name.')
            }
        }
    }
}
function Status(msg, game) {
    let id = GetUserId(msg);
    let player = game.players.find((x) => { return x.playerId == id })
    if (player != null) {
        if (!HandleEnergyRequirements(msg, game, player, 'status')) {
            return;
        }
        let reply = 'Status:';
        reply += `\n${GetPlayerStatsString(player)}`;
        reply += `\n${etPlayerItemsString(player)}`;
        msg.reply(reply);
    }
}
function Equip(msg, game, target) {
    let id = GetUserId(msg);
    let player = game.players.find((x) => { return x.playerId == id });
    if (player != null) {
        if (target == null) {
            if (!HandleEnergyRequirements(msg, game, player, 'autofill possibilities')) {
                return;
            }
            let reply = `Equipable ${GetPlayerEquipableItemsString(player, game)}`;
            msg.reply(reply);
        }
        let itemInfo = player.inv.find((x) => { return x.name == target });
        if (itemInfo != null) {
            if (itemInfo.type == 'weapon') {
                if (!HandleEnergyRequirements(msg, game, player, 'equip')) {
                    return;
                }
                player.equippedItem = itemInfo.name;
                msg.reply(`You have equipped ${player.equippedItem}.`);
            }
        }
    }
}
function Attack(msg, game, target) {
    let id = GetUserId(msg);
    let player = game.players.find((X) => { return X.playerId == id });
    if (player != null) {
        locationInfo = game.locations.find((x) => { return x.name == player.loc });
        if (locationInfo != null) {
            if (target == null) {
                if (!HandleEnergyRequirements(msg, game, player, 'autofill possibilities')) {
                    return;
                }
                filteredPlayers = game.players.filter((x) => { return x.loc == locationInfo.name && x.playerId != id });
                let reply = GetOtherPlayerListString(player, game);
                msg.reply(reply);
                return;
            }
            let otherPlayer = game.players.find((x) => { return x.name == target });
            if (otherPlayer != null) {
                //check energy beforeHand
                if (!HandleEnergyRequirements(msg, game, player, 'attack')) {
                    return;
                }
                let attackInfo = PlayerAttack(msg, player, otherPlayer, false);
                if (!attackInfo.didAttack) {
                    player.energy += game.energyCostLookup.find((X) => { return X.name == actionName }).value
                    return
                }
                if (attackInfo.canCounter) {
                    let counterChance = otherPlayer.trait == 'martialArtest' ? 20 : 10;
                    if (Math.floor(Math.random() * 100) <= counterChance) {
                        PlayerAttack(msg, otherPlayer, player, true);
                    }
                }
            }
        }
    }
}
//#endregion

//#region Helper methods
function RemovePlayer(msg, game, player) {
    SendMessageToUserById(player.playerId, 'You have been smitted and are removed from the game.')
    let location = game.locations.find((x) => { return x.name == player.loc });
    if (location != null) {
        player.inv.forEach(element => {
            location.items.push(element);
        });
    }
    players = game.players.filter((x) => x.playerId != player.playerId)
    SendMessageToBBInfoChannel(game.ServerId, `Player ${player.name} has died.`)
    if (players.length <= 1) {
        EndGame(msg, game);
    }
}

function PlayerAttack(msg, game, attacker, target, isCounter) {
    let equippedItemInfo = game.itemLookup.find((x) => { return x.name == attacker.equippedItem });
    let canCounter = equippedItemInfo == null || equippedItemInfo.subType == 'melee';
    let didAttack = true;
    if (equippedItemInfo == null) {
        if (player.trait == 'boxer') {
            DamagePlayer(msg, game, target, meeleDamage * 2, attacker.name);
        } else {
            DamagePlayer(msg, game, target, meeleDamage, attacker.name);
        }
    } else if (equippedItemInfo.subType == 'melee') {
        DamagePlayer(msg, game, target, equippedItemInfo.value);
    } else if (!isCounter) {
        let ammo = attacker.inv.find((x) => x == equippedItemInfo.name + '-ammo');
        if (ammo != null) {
            let hitChance = player.trait == 'sharpShooter' ? 95 : 80;
            if (Math.floor(Math.random() * 100) <= hitChance) {
                DamagePlayer(msg, game, target, equippedItemInfo.value, target.name);
                RemoveItemFromPlayer(attacker, equippedItemInfo.name + '-ammo');
            }
        } else {
            didAttack = false;
        }
    }
    return { canCounter: canCounter, didAttack: didAttack };
}

function DamagePlayer(msg, game, player, damage, source) {
    player.health -= damage;
    let sourceString = source ? ' from ' + source : '';
    SendMessageToUserById(player.playerId, `You have received ${damage} damage${sourceString}.`)
    if (player.health <= 0) {
        RemovePlayer(msg, game, player)
    }
}

function RemoveItemFromPlayer(player, itemName) {
    let index = player.inv.findIndex((x) => { return x.name == itemName });
    if (index != -1) {
        player.inv.splice(index, 1);
    }
}

function RemoveItemFromLocation(location, itemName) {
    let index = location.items.findIndex((x) => { return x.name == itemName });
    if (index != -1) {
        location.items.splice(index, 1);
    }
}

function SendMessageToUserById(id, message) {
    let user = client.users.cache.find((u) => { return u.id == id });
    user.send(message);
}

function SendMessageToChannelById(Channelid, message) {
    let channel = client.channels.cache.find((c) => { return c.ed == id });
    channel.send(message);
}

function SendMessageToBBInfoChannel(ServerId, message) {
    let guild = client.guilds.cache.find((g) => { return g.id == ServerId });
    if (guild) {
        let channel = guild.channels.cache.find((c) => c.name == 'bb-game-info');
        if (channel) {
            channel.send(message);
        }
    }
}

function SendMessageToBBSetupChannel(ServerId, message) {
    let guild = client.guilds.cache.find((g) => { return g.id == id });
    if (guild) {
        let channel = guild.channels.cache.find((c) => c.name == 'bb-game-setup');
        if (channel) {
            channel.send(message);
        }
    }
}

function HandleEnergyRequirements(msg, game, player, actionName) {
    let actionInfo = game.energyCostLookup.find((X) => { return X.name == actionName })
    if (player.energy < actionInfo.cost) {
        msg.reply(`You do not have the energy to preform ${actionName}. Required energy: ${actionInfo.cost}.`)
        return false;
    } else {
        player.energy -= actionInfo.cost;
    }
    return true;
}

function EndGame(msg, game) {
    //Remove game info
    let winner = game.players.length == 1 ? game.players[0] : null;
    games[game.ServerId] = undefined;
    AllPlayers[game.GmId] = undefined;
    game.players.forEach(element => {
        AllPlayers[element.playerId] = undefined;
    });
    //Remove roles
    let guild = client.guilds.cache.find((g) => { return g.id == game.ServerId });
    if (guild) {
        let role = guild.roles.cache.find((r) => { return r.name == 'BBGM' });
        if (role) {
            let user = guild.members.cache.find((u) => { return u.id == game.GmId });
            user.roles.remove(role);
        }
    }
    //Sned message
    SendMessageToBBInfoChannel(game.ServerId, `The game has ended. ${winner ? `Winner: ${winner.name}.` : ''}.`)
}

function GetUserId(msg) {
    return msg.mem == null ? msg.author == null ? '' : msg.author.id : msg.mem.user.id;
}

function GetServerId(msg) {
    return msg.guildId;
}

function delayForSeconds(sec) {
    return new Promise(resolve => setTimeout(resolve, sec * 1000));
}
//#endregion

//#region String Methods
function GetGeneralHelpString() {
    let reply = 'Battle Bot Info: This is a bot that facilitates a battle royal game with one game master and multiple players'
    reply += '\nFor information on specific commands/setup use on of the following help commands';
    reply += '\n!help configuration'
    reply += '\n!help gameSetup'
    reply += '\n!help gameMaster'
    reply += '\n!help player'
    reply += '\n!help energy'
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
    reply += `\nUsing any commands without the following input marked in () will show the possible input options.`
    reply += `\n!gm drop (locationName itemName) - Drop an item in a specified location.`;
    reply += '\n!gm kill (player name) - Remove a specified player from the game.';
    reply += '\n!gm hazard (locationName hazardName) - Cause a hazard in a specified location.';
    reply += '\n!gm close (locationName moveType) - Close off a location. MoveType: default=Move character, kill=Kill character';
    reply += '\n!gm list (info type) - List information about the current game.';
    reply += '\n!gm end - Ends the current game.';
    return reply;
}
function GetPlayerHelpString() {
    let reply = 'The follow commands are used by the player to play the game.'
    reply += `\nUsing any commands without the following input marked in () will show the possible input options.`
    reply += `\n!p look - Displays the information for the current location the player is at..`;
    reply += '\n!p pickup (item name)- Pick up an item that is at your current location';
    reply += '\n!p move (location name) - Move to a location that is connected to your current location.';
    reply += '\n!p drop (item name) - Drop an item currently in your inventory.';
    reply += `\n!p use (item name) - Use a consumable item in your inventory.`;
    reply += '\n!p status - Displays the current status of your character.';
    reply += '\n!p equip (item name) - Equip a weapon in your inventory.';
    reply += '\n!p attack (player name) - Attack another player at your current location.';
    return reply;
}
function GetTraitsString() {
    let reply = 'Possible traits for your character:';
    reply += `\nboxer: deal extra unarmed damage.`;
    reply += `\nnurse: heal extra health with healing items.`;
    reply += `\nsharpshooter: less chance to miss a shot fired from a gun.`;
    reply += `\nrunner: Have more max stamina.`;
    reply += `\nmartialArtest: better chance to counter attack when receiving a melee attack.`;
    return reply;
}
function GetEnergyHelpString(serverId) {
    let reply = 'The following are the energy requirements for different actions. When no game is going on in the server the values will be the default, otherwise, it will be the energy requirements for the current game.'
    let currentGame = games[serverId];
    if(!currentGame) {
        basicEnergyCostLookup.forEach(element => {
            reply += `\n${element.name} - ${element.cost}`
        });
    } else {
        currentGame.energyCostLookup.forEach(element => {
            reply += `\n${element.name} - ${element.cost}`
        })
    }
    return reply;
}
function GetOpenLocationsString(game) {
    var reply = 'Locations: ';
    let filteredLocations = game.locations.filter((x) => { return !x.closed })
    for (let i = 0; i < filteredLocations.length; i++) {
        reply += filteredLocations[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetConnectedLocationsString(loc, game) {
    let reply = 'Connected Locations: ';
    if (loc.connectedLoc.length == 0) {
        reply += 'None'
    }
    for (let i = 0; i < loc.connectedLoc.length; i++) {
        locInfo = game.locations.find((x) => { return x.name == loc.connectedLoc[i] })
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
        reply += location.items[i].name + ',';
    };
    if (reply.charAt(reply.length - 1) == ',')
        reply = reply.slice(0, reply.length - 1)
    return reply
}
function GetLocationPlayersString(location, game) {
    let reply = 'Players: ';
    PlayerList = game.players.filter((x) => { return x.loc = location })
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
function GetPlayersString(game) {
    let reply = 'Players:  ';
    for (let i = 0; i < game.players.length; i++) {
        reply += game.players[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetPlayerItemsString(player) {
    let reply = 'Items: '
    if (player.inv.length == 0) {
        reply += 'None';
    }
    for (let i = 0; i < player.inv.length; i++) {
        reply += player.inv[i].name + ',';
    };
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetPlayerUsableItemsString(player, game) {
    let reply = 'Items: '
    if (player.inv.length == 0) {
        reply += 'None';
    }
    for (let i = 0; i < player.inv.length; i++) {
        let itemInfo = game.itemLookup.find((x) => { return x.name == player.inv[i].name });
        if (itemInfo.type == 'consumable' && itemInfo.subType != 'ammo') {
            reply += player.inv[i].name + ',';
        }
    };
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetPlayerEquipableItemsString(player, game) {
    let reply = 'Items: '
    var itemCount = 0
    for (let i = 0; i < player.inv.length; i++) {
        let itemInfo = game.itemLookup.find((x) => { return x.name == player.inv[i].name });
        if (itemInfo.type == 'weapon') {
            reply += player.inv[i].name + ',';
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
    let reply = 'Health: ' + player.health;
    reply += '\nEnergy: ' + player.energy;
    reply += '\nLocation: ' + player.loc;
    reply += '\ntrait: ' + player.trait;
    reply += '\nWeight: ' + player.invWeight;
    reply += '\nEquipped Item: ' + player.equippedItem;
    return reply;
}
function GetItemLookupListString(game) {
    let reply = 'Items: ';
    for (let i = 0; i < game.itemLookup.length; i++) {
        reply += game.itemLookup[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
function GetOtherPlayerListString(player, game) {
    let reply = 'Players: ';
    PlayerList = game.players.filter((x) => { return x.loc == player.loc && player.name != x.name })
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
function GetHazardListString(game) {
    let reply = 'Hazards: ';
    for (let i = 0; i < game.hazardLookup.length; i++) {
        reply += game.hazardLookup[i].name + ',';
    }
    if (reply.charAt(reply.length - 1) == ',') {
        reply = reply.slice(0, reply.length - 1);
    }
    return reply;
}
//#endregion

//#region async methods
async function RegenEnergy(currentGame) {
    while (currentGame.gameState == 'in-progress' && games[currentGame.ServerId]) {
        currentGame.players.forEach(element => {
            let maxEnergy = element.trait == 'runner' ? 120 : 100;
            element.energy = Math.min(maxEnergy, element.energy + 1);
        });
        await delayForSeconds(5);
    }
}
//#endregion

//#region Constructors
function Player(member) {
    this.playerId = member.user.id;
    this.name = member.user.username,
        this.health = 100,
        this.energy = 100,
        this.loc = 'none',
        this.trait = 'none',
        this.invWeight = 0,
        this.inv = [],
        this.equippedItem = 'none'
}
function Location(name, game, itemAndLocationObject) {
    this.name = name;
    this.connectedLoc = itemAndLocationObject.connectedLocations;
    this.items = [];
    this.closed = false;
    itemAndLocationObject.itemsToAdd.forEach(element => {
        this.items.push(game.itemLookup.find((x) => x.name == element));
    });
}
function Game(GmId, ServerId) {
    this.GmId = GmId;
    this.ServerId = ServerId;
    this.players = [];
    this.locations = [];
    this.gameState = 'None';
    this.itemLookup = JSON.parse(JSON.stringify(basicItemLookup))
    this.hazardLookup = JSON.parse(JSON.stringify(basicHazardLookup))
    this.energyCostLookup = JSON.parse(JSON.stringify(basicEnergyCostLookup))
}
//#endregion
// client.login logs the bot in and sets it up for use. You'll enter your token here.
client.login('OTczMzExNDM5ODE1MjA5MDAw.GKvoXb.ZZlANDlxldTzP6wP4AY2HAdTNKy9MJoJrM0_oE')