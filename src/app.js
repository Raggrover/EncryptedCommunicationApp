// This is the main file of encrypted chat app.

var express = require('express');
var path = require("path");
var app = express();
var port = 8080;

var io = require('socket.io').listen(app.listen(port));

app.set('view engine', 'html');

app.engine('html', require('ejs').renderFile);

app.set('views', path.join(__dirname, 'client/views'));

app.use(express.static(path.join(__dirname, 'client')));

app.get('/', function (req, res) {
	res.render('chat');
});

require('./server/server')(app, io);

console.log('Encrypted chat is running on http://localhost:' + port);