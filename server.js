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

// Store clients with their roles (host or client)
const clients = new Map();

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
  console.log('Client connected');
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
        // Store the client's mode (host or client)
        clients.set(ws, data.value);
        console.log(`Client registered as: ${data.value}`);
        
        // Send confirmation back to the client
        ws.send(JSON.stringify({ 
          type: 'system', 
          message: `Registered as ${data.value}` 
        }));
        
        logConnectionState();
      } else {
        // Forward messages between host and client
        const senderMode = clients.get(ws);
        if (!senderMode) {
          console.error('Client not registered with a mode yet');
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'You must register as host or client first' 
          }));
          return;
        }
        
        const targetMode = senderMode === 'host' ? 'client' : 'host';
        console.log(`Forwarding message type ${data.type} from ${senderMode} to ${targetMode}`);
        
        // Find clients with the opposite role and forward the message
        let forwarded = false;
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN && clients.get(client) === targetMode) {
            try {
              client.send(messageStr);
              forwarded = true;
              console.log(`Message forwarded to ${targetMode}`);
            } catch (error) {
              console.error('Error forwarding message:', error);
            }
          }
        });
        
        if (!forwarded) {
          console.log(`No ${targetMode} available to receive the message`);
          // Notify the sender that there's no recipient
          ws.send(JSON.stringify({ 
            type: 'system', 
            message: `No ${targetMode} connected to receive your message` 
          }));
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
    const role = clients.get(ws);
    console.log(`Client disconnected (${role || 'unknown role'})`);
    clients.delete(ws);
    logConnectionState();
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
    logConnectionState();
  });
});

// Periodically check and log connection state
setInterval(logConnectionState, 30000);
