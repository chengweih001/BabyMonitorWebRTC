const hostButton = document.getElementById('host-button');
const clientButton = document.getElementById('client-button');
const remoteVideo = document.getElementById('remote-video');

let peerConnection;
let ws;

hostButton.addEventListener('click', () => start('host'));
clientButton.addEventListener('click', () => start('client'));

async function start(mode) {
    console.log(`Starting ${mode} mode`);
    ws = new WebSocket('wss://kind-purring-bayberry.glitch.me/');

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

        if (message.type === 'offer') {
            console.log('Received offer:', message.sdp);
            try {
                await peerConnection.setRemoteDescription({ type: 'offer', sdp: message.sdp });
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
            } catch (error) {
                console.error('Error handling offer:', error);
            }
        } else if (message.type === 'answer') {
            console.log('Received answer:', message.sdp);
            try {
                await peerConnection.setRemoteDescription({ type: 'answer', sdp: message.sdp });
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        } else if (message.type === 'iceCandidate') {
            console.log('Received ICE candidate:', message.candidate);
            try {
                await peerConnection.addIceCandidate(message.candidate);
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
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
        remoteVideo.srcObject = event.streams[0];
        console.log('Received remote stream');
    };

    peerConnection.onconnectionstatechange = event => {
        console.log('Peer connection state change:', peerConnection.connectionState);
    };

    if (mode === 'host') {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            console.log('Offer:', offer.sdp);
            ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
        } catch (error) {
            console.error('Error starting host mode:', error);
        }
    } else {
        peerConnection.addTransceiver('video', { direction: 'recvonly' });
    }
}
