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