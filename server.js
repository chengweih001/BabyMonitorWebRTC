const WebSocket = require('ws');
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

const wss = new WebSocket.Server({ server });

// Store clients with their roles (host or client) and unique IDs
const clients = new Map();
let nextClientId = 1; // Simple ID assignment

// Function to get the count of connected clients (excluding hosts)
function getClientCount() {
  let count = 0;
  clients.forEach((clientInfo) => {
    if (clientInfo.role === 'client') {
      count++;
    }
  });
  return count;
}

// Function to notify the host(s) about client count changes
function notifyHostClientUpdate() {
  const clientCount = getClientCount();
  wss.clients.forEach(client => {
    const clientInfo = clients.get(client);
    if (clientInfo && clientInfo.role === 'host' && client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({ type: 'client-update', count: clientCount }));
        console.log(`Notified host ${clientInfo.id} about client count: ${clientCount}`);
      } catch (error) {
        console.error(`Error sending client-update to host ${clientInfo.id}:`, error);
      }
    }
  });
}

// Debug function to log the current state of connections
function logConnectionState() {
  console.log('--- Current Connection State ---');
  console.log(`Total connected clients: ${wss.clients.size}`);
  
  let hostCount = 0;
  let clientCount = 0;
  
  wss.clients.forEach(client => {
    const role = clients.get(client);
    if (role === 'host') hostCount++;
    if (role === 'client') clientCount++;
  });
  
  console.log(`Hosts: ${hostCount}, Clients: ${clientCount}`);
  console.log('-------------------------------');
}

wss.on('connection', ws => {
  const clientId = nextClientId++;
  console.log(`Client connected (ID: ${clientId})`);
  // Temporarily store the client until they register their mode
  clients.set(ws, { id: clientId, role: null }); 
  logConnectionState();

  // Send a welcome message to confirm connection
  try {
    ws.send(JSON.stringify({ type: 'system', message: 'Connected to signaling server' }));
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }

  ws.on('message', message => {
    try {
      const messageStr = message.toString();
      console.log(`Received message: ${messageStr}`);
      
      const data = JSON.parse(messageStr);
      
      if (data.type === 'mode') {
        const clientInfo = clients.get(ws);
        if (clientInfo) {
          clientInfo.role = data.value; // Update the role
          clients.set(ws, clientInfo); // Update the map
          console.log(`Client ${clientInfo.id} registered as: ${clientInfo.role}`);

          // Send confirmation back to the client
          ws.send(JSON.stringify({ 
            type: 'system', 
            message: `Registered as ${clientInfo.role}` 
          }));

          // If a new client joined, notify the host about count and request offer
          if (clientInfo.role === 'client') {
            notifyHostClientUpdate(); // Update count display

            // Find the host and ask them to send an offer
            wss.clients.forEach(potentialHost => {
              const hostInfo = clients.get(potentialHost);
              if (hostInfo && hostInfo.role === 'host' && potentialHost.readyState === WebSocket.OPEN) {
                try {
                  console.log(`Requesting offer from host (ID: ${hostInfo.id}) for new client (ID: ${clientInfo.id})`);
                  potentialHost.send(JSON.stringify({ type: 'request-offer', clientId: clientInfo.id }));
                } catch (error) {
                  console.error(`Error sending request-offer to host ${hostInfo.id}:`, error);
                }
              }
            });
          }
          
          logConnectionState();
        } else {
           console.error('Could not find client info for registration');
           ws.send(JSON.stringify({ type: 'error', message: 'Registration failed: client info not found' }));
        }
      } else {
        // Forward messages between host and client
        const senderInfo = clients.get(ws);
        // Check if the sender has registered a role
        if (!senderInfo || !senderInfo.role) {
          console.error(`Client ${senderInfo?.id || 'unknown'} tried to send message before registering role.`);
          try {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'You must register as host or client first before sending messages.' 
            }));
          } catch (e) {
             console.error('Error sending registration required message:', e);
          }
          return; // Stop processing if not registered
        }

        // Proceed with forwarding logic if registered
        const senderRole = senderInfo.role;
        const targetRole = senderRole === 'host' ? 'client' : 'host';
        console.log(`Forwarding message type ${data.type} from ${senderRole} (ID: ${senderInfo.id}) to ${targetRole}(s)`);

        // Broadcast message to all clients with the target role
        let recipientsFound = false;
        wss.clients.forEach(recipient => {
          const recipientInfo = clients.get(recipient);
          // Check if recipient exists, has the target role, is not the sender, and is connected
          if (recipientInfo && recipientInfo.role === targetRole && recipient !== ws && recipient.readyState === WebSocket.OPEN) {
            try {
              recipient.send(messageStr);
              recipientsFound = true;
              console.log(`Message forwarded to ${targetRole} (ID: ${recipientInfo.id})`);
            } catch (error) {
              console.error(`Error forwarding message to ${targetRole} (ID: ${recipientInfo.id}):`, error);
            }
          }
        });

        if (!recipientsFound) {
          console.log(`No ${targetRole}(s) available to receive the message`);
          // Optionally notify the sender
          // ws.send(JSON.stringify({ type: 'system', message: `No ${targetRole} connected` }));
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      try {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Error processing your message' 
        }));
      } catch (e) {
        console.error('Error sending error message:', e);
      }
    }
  });

  ws.on('close', () => {
    const clientInfo = clients.get(ws);
    const role = clientInfo ? clientInfo.role : 'unknown role';
    const id = clientInfo ? clientInfo.id : 'unknown ID';
    
    console.log(`Client disconnected (ID: ${id}, Role: ${role})`);
    
    if (clients.has(ws)) {
        clients.delete(ws);
        // If a client disconnected, notify the host
        if (role === 'client') {
            notifyHostClientUpdate();
        }
        logConnectionState();
    }
  });
  
  ws.on('error', (error) => {
    const clientInfo = clients.get(ws);
    const id = clientInfo ? clientInfo.id : 'unknown ID';
    console.error(`WebSocket error for client ID ${id}:`, error);
    if (clients.has(ws)) {
        const role = clientInfo.role;
        clients.delete(ws);
        // If a client errored out, notify the host
        if (role === 'client') {
            notifyHostClientUpdate();
        }
        logConnectionState();
    }
  });
});

// Periodically check and log connection state
setInterval(logConnectionState, 30000);
