const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

// Create the HTTPS server
const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/example.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/example.com/fullchain.pem'),
};

const secureServer = https.createServer(options, (request, response) => {
    response.writeHead(404);
    response.end();
});

// Upgrade the HTTPS server to handle WebSocket connections
secureServer.on('upgrade', (request, socket, head) => {
    secureWss.handleUpgrade(request, socket, head, (websocket) => {
        secureWss.emit('connection', websocket, request);
    });
});

// Start listening for HTTPS requests on port 8443
const SECURE_PORT = process.env.SECURE_PORT || 8443;

secureServer.listen(SECURE_PORT, () => {
    console.log(`HTTPS server listening on port ${SECURE_PORT}`);
});

// Create the secure WebSocket server
const secureWss = new WebSocket.Server({ noServer: true });

// Store the connected clients and their usernames
const clients = new Map();

secureWss.on('connection', (socket) => {
    let heartbeatInterval;

    socket.on('message', (message) => {
        const messageData = JSON.parse(message);

        if (messageData.type === 'join') {
            // Store the username associated with the socket connection
            const { username } = messageData;
            clients.set(socket, sanitize(username));

            // Send the list of connected usernames to all clients
            sendUserList();
        } else if (messageData.type === 'message') {
            // Check if it's a private message
            if (messageData.to) {
                // Find the recipient client and send the message
                clients.forEach((clientUsername, clientSocket) => {
                    if (clientUsername === sanitize(messageData.to)) {
                        clientSocket.send(JSON.stringify(messageData));
                    }
                });
            } else {
                // Broadcast the message to all clients
                clients.forEach((clientUsername, clientSocket) => {
                    clientSocket.send(JSON.stringify(messageData));
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
        clients.delete(socket);

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
});

// Function to send the list of connected usernames to all clients
function sendUserList() {
    const usernames = Array.from(clients.values());
    const userListMessage = {
        type: 'userList',
        usernames: usernames.map(sanitize)
    };
    clients.forEach((clientUsername, clientSocket) => {
        clientSocket.send(JSON.stringify(userListMessage));
    });
}

// Function to sanitize user input to prevent injection attacks
function sanitize(input) {
    return input.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
