"use strict";

var gravatar = require('gravatar');
var manager = require('./manager.js');
var crypto = require("crypto-js");
var serverVersion = manager.generateGuid();
var globalChannel = "environment"; 
var chat = {};
var loginExpireTime = 120 * 1000;

module.exports = function (app, io) {
    chat = io;
    io.on('connection', function (socket) {
        console.info(`socket: ${socket.id} connected`);

        socket.on('login', data => {
            var userHashedPass = crypto.TripleDES.decrypt(data.password, socket.id).toString(crypto.enc.Utf8);

            var user = manager.clients[data.email.hashCode()];
            if (user) { //if it is an existing user                
                if (user.password == userHashedPass) {
                    if (user.lastLoginDate + loginExpireTime > Date.now()) { // expire after 2 min
                        userSigned(user, socket);
                    }
                    else {
                        socket.emit("resign");
                    }
                    user.lastLoginDate = Date.now(); // update when the user logged in
                }
                else {
                    socket.emit("exception", "The username or password is incorrect!");
                    console.info(`User <${user.username}> can't login, because that password is incorrect!`);
                }
            }
            else { // new user
                // Use the socket object to store data. Each client gets their own unique socket object
                var user = {
                    "socketid": socket.id,
                    "id": data.email.hashCode(),
                    "username": data.username, 
                    "email": data.email,                                        
                    "password": userHashedPass,
                    "avatar": gravatar.url(data.email, { s: '140', r: 'x', d: 'mm' }), 
                    "status": "online",
                    "lastLoginDate": Date.now()
                };
                manager.clients[user.id] = user;
                userSigned(user, socket);
            }
        });

    });
}

function userSigned(user, socket) {
    user.status = "online";
    user.socketid = socket.id;
    socket.user = user;

    socket.emit("signed", {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "avatar": user.avatar,
        "status": user.status,
        "serverVersion": serverVersion,
    });

    socket.join(globalChannel);

    // add user to all joined chats available
    var userChannels = manager.getUserChannels(user.id, true); // by p2p channel
    for (var channel in userChannels) {
        socket.join(channel);
    }

    updateAllUsers();
    defineSocketEvents(socket);

    console.info(`User <${user.username}> by socket <${user.socketid}> connected`)
} //User is signed-in

function updateAllUsers() {
    // Update new user was being added and for every socket list is updated except the one started it
    chat.sockets.in(globalChannel).emit("update", { users: manager.getUsers(), channels: manager.getChannels() });
}

function createChannel(name, user, p2p) {
    var channel = { name: name, p2p: p2p, adminUserId: user.id, status: "online", users: [user.id] };
    manager.channels[name] = channel;
    chat.sockets.connected[user.socketid].join(name); // add admin to self chat
    return channel;
}

function defineSocketEvents(socket) {

    socket.on('disconnect', () => {
        // Sockets will leave all the chats they were part of automatically 

        var user = socket.user || manager.findUser(socket.id);
        if (user) {
            console.warn(`User <${user.username}> by socket <${user.socketid}> disconnected!`);
            user.status = "offline";

            socket.broadcast.to(globalChannel).emit('leave',
                { username: user.username, id: user.id, avatar: user.avatar, status: user.status });
        }
    });

    //managing when user is sending msg
    socket.on("msg", data => {
        var from = socket.user || manager.findUser(socket.id);
        var channel = manager.channels[data.to];

        if (from != null && channel != null && channel.users.indexOf(from.id) != -1) {
            var msg = manager.messages[channel.name];
            if (msg == null)
                msg = manager.messages[channel.name] = [];

            data.date = Date.now();
            data.type = "msg";
            chat.sockets.in(channel.name).emit('receive', data);
            msg.push(data);
        }
    });

    socket.on("request", data => {

        // find user who requested to this chat by socket id
        var from = socket.user || manager.findUser(socket.id);

        // if user is available 
        if (from) {
            data.from = from.id;

            var adminUser = manager.getAdminFromChannelName(data.channel, from.id)

            if (adminUser) {
                if (adminUser.status == "offline") {
                    var p2p = (manager.channels[data.channel] == null ? true : manager.channels[data.channel].p2p);
                    socket.emit("reject", { from: adminUser.id, channel: data.channel, p2p: p2p, msg: "admin user is offline" });
                }
                else
                    chat.to(adminUser.socketid).emit("request", data)
                return;
            }
        }
        //if admin is not found, handled null pointer exception
        socket.emit("exception", "The requested chat not found!");
    });

        
    socket.on("accept", data => {

        var from = socket.user || manager.findUser(socket.id);

        var to = manager.clients[data.to];

        if (from != null && to != null) {
            var channel = manager.channels[data.channel];

            if (channel == null) {
                channel = createChannel(data.channel, from, true)
            }
            
            channel.users.push(to.id);
            chat.sockets.connected[to.socketid].join(channel.name); // add new user to chat channel

            socket.to(to.socketid).emit("accept", { from: from.id, channel: channel.name, p2p: channel.p2p, channelKey: data.channelKey })
        }
    });

    socket.on("createChannel", name => {
        var from = socket.user;
        var channel = manager.channels[name];

        if (channel) {
            socket.emit("reject", { from: from.id, p2p: false, channel: channel, msg: "The given channel name is already exist" })
            return;
        }

        channel = createChannel(name, from, false);
        updateAllUsers();

        console.info(`Channel <${channel.name}> created by user <${from.username}: ${channel.adminUserId}>`)
    });


    socket.on("reject", data => {

        var from = socket.user || manager.findUser(socket.id);

        var to = manager.clients[data.to];

        if (from != null && to != null) {
            var channel = manager.channels[data.channel];
            socket.to(to.socketid).emit("reject", { from: from.id, p2p: (channel == null), channel: data.channel })
        }
    });

    socket.on("fetch-messages", channelName => {
        var fetcher = socket.user || manager.findUser(socket.id);

        var channel = manager.channels[channelName];

        if (fetcher != null && channel != null && channel.users.indexOf(fetcher.id) !== -1)
            socket.emit("fetch-messages", { channel: channel.name, messages: manager.messages[channel.name] });
        else
            socket.emit("exception", `you are not joined in <${channelName}> channel or maybe the server was lost your data!!!`);
    });

    socket.on("typing", channelName => {
        var user = socket.user || manager.findUser(socket.id);
        var channel = manager.channels[channelName];

        if (user && channel && channel.users.indexOf(user.id) !== -1) {
            chat.sockets.in(channel.name).emit("typing", { channel: channel.name, user: user.id });
        }
    });
    
}