const http = require('http');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const { Client, GatewayIntentBits } = require('discord.js');

// Create the HTTP server
const httpServer = http.createServer((request, response) => {
    response.writeHead(404);
    response.end();
});

// Create the HTTPS server
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/example.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/example.com/fullchain.pem'),
};

const httpsServer = https.createServer(options, (request, response) => {
    response.writeHead(404);
    response.end();
});

// Upgrade the HTTP server to handle WebSocket connections
const httpWss = new WebSocket.Server({ noServer: true });
httpServer.on('upgrade', (request, socket, head) => {
    httpWss.handleUpgrade(request, socket, head, (websocket) => {
        httpWss.emit('connection', websocket, request);
    });
});

// Upgrade the HTTPS server to handle WebSocket connections
const httpsWss = new WebSocket.Server({ noServer: true });
httpsServer.on('upgrade', (request, socket, head) => {
    httpsWss.handleUpgrade(request, socket, head, (websocket) => {
        httpsWss.emit('connection', websocket, request);
    });
});

// Start listening for HTTP and HTTPS requests on the specified ports
const HTTP_PORT = 8084; // Change to the desired HTTP port
const HTTPS_PORT = 8444; // Change to the desired HTTPS port

httpServer.listen(HTTP_PORT, () => {
    console.log(`${HTTP_PORT} Chat v2`);
});

httpsServer.listen(HTTPS_PORT, () => {
    console.log(`${HTTPS_PORT} Chat v2`);
});

// Store the connected clients and their usernames
const clients = new Map();

// Function to send a notification to the Discord server when a user joins
function sendUserJoinNotification(username) {
    const channel = discordClient.channels.cache.get(targetChannelID);
    if (channel) {
        channel.send(`**${username}** has joined the chat.`);
    }
}

// Function to send a notification to the Discord server when a user leaves
function sendUserLeaveNotification(username) {
    const channel = discordClient.channels.cache.get(targetChannelID);
    if (channel) {
        channel.send(`**${username}** has left the chat.`);
    }
}

httpWss.on('connection', (socket) => {
    handleWebSocketConnection(socket);
});

httpsWss.on('connection', (socket) => {
    handleWebSocketConnection(socket);
});

function handleWebSocketConnection(socket) {
    let heartbeatInterval;

    socket.on('message', (message) => {
        const messageData = JSON.parse(message);

        if (messageData.type === 'join') {
            // Store the username associated with the socket connection
            const { username } = messageData;
            clients.set(socket, sanitize(username));
            sendUserJoinNotification(username); // Notify Discord when a user joins

            // Send the list of connected usernames to all clients
            sendUserList();
        } else if (messageData.type === 'message') {
            if (!messageData.to) {
                // Broadcast the message to all clients
                clients.forEach((clientUsername, clientSocket) => {
                    clientSocket.send(JSON.stringify(messageData));
                });
                sendMessageToDiscord(clients.get(socket), messageData.message); // Forward the message to Discord
            } else {
                // Find the recipient client and send the message
                clients.forEach((clientUsername, clientSocket) => {
                    if (clientUsername === sanitize(messageData.to)) {
                        clientSocket.send(JSON.stringify(messageData));
                    }
                });
            }
        } else if (messageData.type === 'typingIndicator') {
            // Broadcast the typing indicator to all clients
            clients.forEach((clientUsername, clientSocket) => {
                if (clientSocket !== socket) {
                    clientSocket.send(JSON.stringify(messageData));
                }
            });
        } else if (messageData.type === 'heartbeat') {
            // Respond to the heartbeat message
            socket.send(JSON.stringify({ type: 'heartbeat' }));
        }
    });

    socket.on('close', () => {
        // Remove the socket from the clients map when it is closed
        const username = clients.get(socket);
        clients.delete(socket);
        sendUserLeaveNotification(username); // Notify Discord when a user leaves

        // Send the updated list of connected usernames to all clients
        sendUserList();

        // Stop the heartbeat interval
        stopHeartbeat();
    });

    function startHeartbeat() {
        heartbeatInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                // Send a heartbeat message to the client
                socket.send(JSON.stringify({ type: 'heartbeat' }));
            } else {
                // If the socket is closed, stop the heartbeat interval
                stopHeartbeat();
            }
        }, 5000); // Send a heartbeat message every 5 seconds
    }

    function stopHeartbeat() {
        clearInterval(heartbeatInterval);
    }

    // Start the heartbeat interval when a connection is established
    startHeartbeat();
}

// Function to send the list of connected usernames to all clients
function sendUserList() {
    const usernames = Array.from(clients.values());

    const userListMessage = {
        type: 'userList',
        usernames: usernames.map(sanitize),
    };
    clients.forEach((clientUsername, clientSocket) => {
        clientSocket.send(JSON.stringify(userListMessage));
    });
}

// Function to sanitize user input to prevent injection attacks
function sanitize(input) {
    return input.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const targetChannelID = '1111111111111111111'; // Replace with your Discord channel ID

discordClient.once('ready', () => {
    console.log(`Logged in as ${discordClient.user.tag}`);
});

discordClient.login('aaaaaaaaaaaaaaaaaaaaaaaa.aaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

function sendMessageToWebsite(message) {
    clients.forEach((clientUsername, clientSocket) => {
        const messageData = {
            type: 'message',
            from: 'Discord',
            message,
        };
        clientSocket.send(JSON.stringify(messageData));
    });
}

function sendMessageToDiscord(username, message) {
    const channel = discordClient.channels.cache.get(targetChannelID);
    if (channel) {
        channel.send(`Website - ${username}: ${message}`);
    }
    console.log('Sending message to Discord:', message);
}

discordClient.on('messageCreate', (message) => {
    if (message.author.bot) return; // Ignore messages from other bots
    
    // Check if the message is from the specific channel you want to target
    if (message.channel.id === '1111111111111111111') {
        if (message.attachments.size > 0) {
            // The message contains attachments, loop through them
            message.attachments.forEach(attachment => {
                if (attachment.contentType.startsWith('image')) {
                    const imageUrl = attachment.url;
                    sendMessageToWebsite(`${message.author.username}: ${imageUrl}`);
                } else if (attachment.contentType.startsWith('video')) {
                    const videoUrl = attachment.url;
                    sendMessageToWebsite(`${message.author.username}: ${videoUrl}`);
                }
            });
        } else {
            sendMessageToWebsite(message.author.username + ' - ' + message.content);
        }
    }
});
