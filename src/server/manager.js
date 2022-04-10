var e = {}
module.exports = e;

e.clients = {}; // property: id, value: { socketid, id, username, email, pubKey, password, avatar, status }
e.messageTypes = ["ack", "request", "message", "symmetricKey"];
e.messages = {}; // property: channelName, value { from, to, date, type }
e.channels = {}; // property: channelName, value: { name, p2p, adminUserId, users[] }

e.generateGuid = function () {
    return Math.random().toString(36).substring(2, 10) +
        Math.random().toString(36).substring(2, 10);
}

e.getHashCode = String.prototype.hashCode = function () {
    var hash = 0, i, chr;
    if (this.length == 0) return hash;
    for (i = 0; i < this.length; i++) {
        chr = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(32); // to base 32
}
