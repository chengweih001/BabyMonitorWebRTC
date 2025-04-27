const hostButton = document.getElementById('host-button');
const clientButton = document.getElementById('client-button');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const playVideoButton = document.getElementById('play-video');
const connectionStatus = document.getElementById('connection-status');
const clientCountContainer = document.getElementById('client-count-container');
const clientCountSpan = document.getElementById('client-count');

let peerConnection;
let ws;
let currentMode; // Store the current mode
let localStream;

// Function to create and send an offer (used initially and on request)
async function sendOffer() {
    if (currentMode !== 'host' || !peerConnection || !ws || ws.readyState !== WebSocket.OPEN) {
        console.log('Cannot send offer: Not in host mode or connection not ready.');
        return;
    }
    try {
        console.log('Creating offer...');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('Sending offer:', offer.sdp);
        ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
        connectionStatus.textContent = 'Offer sent. Waiting for client(s)...';
    } catch (error) {
        console.error('Error creating/sending offer:', error);
        connectionStatus.textContent = `Error sending offer: ${error.message}`;
    }
}

hostButton.addEventListener('click', () => start('host'));
clientButton.addEventListener('click', () => start('client'));
playVideoButton.addEventListener('click', () => {
    if (remoteVideo.srcObject) {
        remoteVideo.play().catch(error => {
            console.error('Error playing remote video:', error);
        });
    }
});

async function start(mode) {
    console.log(`Starting ${mode} mode`);
    currentMode = mode; // Store the mode
    // ws = new WebSocket('wss://kind-purring-bayberry.glitch.me/');
    ws = new WebSocket('ws://localhost:8080/');

    // Hide mode selection buttons
    hostButton.style.display = 'none';
    clientButton.style.display = 'none';

    // Show client count only for host
    if (mode === 'host') {
        clientCountContainer.style.display = 'block';
    } else {
        clientCountContainer.style.display = 'none';
    }

    ws.onopen = () => {
        console.log('Connected to WebSocket server');
        ws.send(JSON.stringify({ type: 'mode', value: mode }));
    };

    ws.onerror = error => {
        console.error('WebSocket error:', error);
    };

    ws.onmessage = async event => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        
        if (message.type === 'system' || message.type === 'error') {
            // Handle system messages from the server
            connectionStatus.textContent = message.message;
            console.log('System message:', message.message);
            return;
        }

        // Handle client count updates for the host
        if (message.type === 'client-update' && currentMode === 'host') {
            clientCountSpan.textContent = message.count;
            console.log(`Client count updated: ${message.count}`);
            return; // Don't update general status for this message type
        }

        // Handle request from server to send offer (for new clients)
        if (message.type === 'request-offer' && currentMode === 'host') {
             console.log(`Received request to send offer for client ID: ${message.clientId}`);
             await sendOffer(); // Re-send the offer
             return; 
        }
        
        connectionStatus.textContent = `Received message: ${message.type}`;

        if (message.type === 'offer') {
            console.log('Received offer:', message.sdp);
            connectionStatus.textContent = 'Processing offer from host...';
            try {
                await peerConnection.setRemoteDescription({ type: 'offer', sdp: message.sdp });
                console.log('Set remote description successfully');
                
                const answer = await peerConnection.createAnswer();
                console.log('Created answer:', answer);
                
                await peerConnection.setLocalDescription(answer);
                console.log('Set local description successfully');
                
                ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
                console.log('Sent answer to host');
                
                connectionStatus.textContent = 'Connected to host, waiting for video stream...';
            } catch (error) {
                console.error('Error handling offer:', error);
                connectionStatus.textContent = `Error handling offer: ${error.message}`;
            }
        } else if (message.type === 'answer') {
            console.log('Received answer:', message.sdp);
            connectionStatus.textContent = 'Received answer from client...';
            try {
                await peerConnection.setRemoteDescription({ type: 'answer', sdp: message.sdp });
                console.log('Set remote description successfully');
                connectionStatus.textContent = 'Connected to client, sending video stream...';
            } catch (error) {
                console.error('Error handling answer:', error);
                connectionStatus.textContent = `Error handling answer: ${error.message}`;
            }
        } else if (message.type === 'iceCandidate') {
            console.log('Received ICE candidate:', message.candidate);
            try {
                await peerConnection.addIceCandidate(message.candidate);
                console.log('Added ICE candidate successfully');
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
                connectionStatus.textContent = `Error adding ICE candidate: ${error.message}`;
            }
        }
    };

    ws.onclose = () => {
        console.log('Disconnected from WebSocket server');
    };

    const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            console.log('ICE candidate:', event.candidate);
            ws.send(JSON.stringify({ type: 'iceCandidate', candidate: event.candidate }));
        }
    };

    peerConnection.ontrack = event => {
        console.log('ontrack event:', event);
        if (event.streams && event.streams[0]) {
            console.log('Setting remote video source from stream:', event.streams[0]);
            
            // Force the video to be visible and styled prominently
            remoteVideo.style.border = '5px solid green';
            remoteVideo.style.display = 'block';
            remoteVideo.style.width = '100%';
            remoteVideo.style.maxWidth = '640px';
            remoteVideo.style.height = 'auto';
            
            // Set the srcObject
            remoteVideo.srcObject = event.streams[0];
            
            // Show the play button
            playVideoButton.style.display = 'block';
            playVideoButton.style.padding = '10px';
            playVideoButton.style.fontSize = '16px';
            playVideoButton.style.margin = '10px auto';
            playVideoButton.style.display = 'block';
            
            connectionStatus.textContent = 'Stream received! Click Play if video does not start automatically.';
            
            // Try to play immediately
            remoteVideo.play().catch(error => {
                console.error('Error auto-playing video:', error);
                connectionStatus.textContent = 'Autoplay blocked. Please click the Play button.';
            });
        } else {
            console.error('No streams available in the track event');
            connectionStatus.textContent = 'Error: No video stream received';
        }
    };

    // This event doesn't actually exist in standard DOM, so we need to use a different approach
    const originalSetter = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject').set;
    
    Object.defineProperty(remoteVideo, 'srcObject', {
        set(value) {
            console.log('remoteVideo.srcObject being set to:', value);
            originalSetter.call(this, value);
        }
    });

    peerConnection.onconnectionstatechange = event => {
        console.log('Peer connection state change:', peerConnection.connectionState);
    };

    peerConnection.oniceconnectionstatechange = event => {
        console.log('ICE connection state change:', peerConnection.iceConnectionState);
        connectionStatus.textContent = `ICE Connection: ${peerConnection.iceConnectionState}`;
    };

    if (mode === 'host') {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localStream.getTracks().forEach(track => {
                console.log('Adding track to peer connection:', track);
                peerConnection.addTrack(track, localStream);
            });
            
            connectionStatus.textContent = 'Host Mode: Waiting for client to connect';
            
            // Send the initial offer
            await sendOffer(); 

        } catch (error) {
            console.error('Error starting host mode:', error);
            connectionStatus.textContent = `Error: ${error.message}`;
        }
    } else {
        try {
            localVideo.style.display = 'none';
            
            // Create a debug button
            const debugButton = document.createElement('button');
            debugButton.textContent = 'Debug Video';
            debugButton.style.margin = '10px';
            document.body.appendChild(debugButton);
            
            debugButton.addEventListener('click', () => {
                console.log('Debug button clicked');
                console.log('Remote video element:', remoteVideo);
                console.log('Remote video srcObject:', remoteVideo.srcObject);
                console.log('Remote video readyState:', remoteVideo.readyState);
                
                if (remoteVideo.srcObject) {
                    // Try to play again
                    remoteVideo.play().catch(e => console.error('Play error:', e));
                    
                    // Check tracks
                    const tracks = remoteVideo.srcObject.getTracks();
                    console.log('Remote video tracks:', tracks);
                    
                    // Force display
                    remoteVideo.style.border = '3px solid red';
                    remoteVideo.style.display = 'block';
                    remoteVideo.style.width = '300px';
                    remoteVideo.style.height = '200px';
                } else {
                    // Try creating a fake stream as a fallback
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = 640;
                        canvas.height = 480;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = 'green';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        
                        // Draw some text
                        ctx.fillStyle = 'white';
                        ctx.font = '30px Arial';
                        ctx.fillText('Waiting for video...', 50, 240);
                        
                        // Create a stream from the canvas
                        const stream = canvas.captureStream(5); // 5 fps
                        remoteVideo.srcObject = stream;
                        remoteVideo.style.border = '5px solid blue';
                        remoteVideo.style.display = 'block';
                        connectionStatus.textContent = 'Using fallback display while waiting for real video';
                        
                        remoteVideo.play().catch(e => console.error('Play error with fallback:', e));
                    } catch (e) {
                        console.error('Error creating fallback stream:', e);
                    }
                }
            });
            
            // Add multiple transceivers to ensure we can receive video
            try {
                peerConnection.addTransceiver('video', { direction: 'recvonly' });
                console.log('Added video transceiver');
            } catch (e) {
                console.error('Error adding video transceiver:', e);
            }
            
            connectionStatus.textContent = 'Client Mode: Connecting to host';
        } catch (error) {
            console.error('Error setting up client mode:', error);
            connectionStatus.textContent = `Error: ${error.message}`;
        }
    }

    remoteVideo.addEventListener('loadedmetadata', () => {
        console.log('Remote video loaded metadata');
        remoteVideo.play().catch(error => {
            console.error('Error playing remote video:', error);
        });
    });

    remoteVideo.addEventListener('error', (error) => {
        console.error('Remote video error:', error);
    });
}
