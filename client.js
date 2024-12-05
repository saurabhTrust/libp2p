
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { webRTC } from '@libp2p/webrtc'
import { identify } from '@libp2p/identify'
import { multiaddr } from '@multiformats/multiaddr'
import * as filters from '@libp2p/websockets/filters'

class P2PClient {
    constructor() {
        this.node = null;
        this.localStream = null;
        this.connections = new Map();
        this.peerConnections = new Map();
    }

    async initializeAsListener(relayMultiaddr) {
        this.node = await createLibp2p({
            addresses: {
                listen: ['/p2p-circuit', '/webrtc']
            },
            transports: [
                webSockets({ filter: filters.all }),
                webRTC({
                    rtcConfiguration: {
                        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                    }
                }),
                circuitRelayTransport()
            ],
            connectionEncrypters: [noise()],
            streamMuxers: [yamux()],
            services: {
                identify: identify()
            },
            connectionGater: {  // connection gater
                denyDialMultiaddr: () => false,
            }
        });

        // Register protocol handlers before starting
        this.setupSignalingHandler();

        await this.node.start();
        await this.node.dial(relayMultiaddr);
        console.log('Connected to relay as listener');

        // Wait for WebRTC address
        let webRTCAddr;
        while (true) {
            webRTCAddr = this.node.getMultiaddrs().find(ma => ma.toString().includes('/webrtc'));
            if (webRTCAddr) break;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('Listener ready with address:', webRTCAddr.toString());
        return this.node.peerId.toString();
    }

    async initializeAsDialer(relayMultiaddr) {
        this.node = await createLibp2p({
            transports: [
                webSockets({ filter: filters.all }),
                webRTC({
                    rtcConfiguration: {
                        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                    }
                }),
                circuitRelayTransport()
            ],
            connectionEncrypters: [noise()],
            streamMuxers: [yamux()],
            services: {
                identify: identify()
            },
            connectionGater: {  // connection gater
                denyDialMultiaddr: () => false,
            }
        });

        // Register protocol handlers before starting
        this.setupSignalingHandler();

        await this.node.start();
        console.log('Started as dialer with ID:', this.node.peerId.toString());
        return this.node.peerId.toString();
    }

    setupSignalingHandler() {
        this.node.handle('/webrtc-signaling/1.0.0', async ({ connection, stream }) => {
            try {
                const peerId = connection.remotePeer.toString();
                const decoder = new TextDecoder();
                if (!this.localStream) {
                    await this.startMedia();
                    const localVideo = document.getElementById("localVideo");
                    if (localVideo) {
                        localVideo.srcObject = this.localStream;
                    }
                }

                for await (const data of stream.source) {
                    const message = JSON.parse(decoder.decode(data.subarray()));
                    console.log('Received signaling message:', message.type);

                    let peerConnection = this.connections.get(peerId)?.peerConnection;

                    if (message.type === 'offer') {
                        if (!peerConnection) {
                            peerConnection = this.createPeerConnection(peerId, connection);
                        }
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        await this.sendSignalingMessage(connection, {
                            type: 'answer',
                            sdp: answer
                        });
                    } else if (message.type === 'answer') {
                        if (peerConnection) {
                            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
                        }
                    } else if (message.type === 'ice-candidate') {
                        if (peerConnection) {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                        }
                    }
                }
            } catch (err) {
                console.error('Error handling signaling message:', err);
            }
        });
    }

    createPeerConnection(peerId, connection) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        peerConnection.ontrack = (event) => {
            console.log('Received remote track');
            const remoteVideo = document.getElementById('remoteVideo');
            console.log(remoteVideo);
            console.log(event.streams[0]);
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        peerConnection.onicecandidate = async (event) => {
            if (event.candidate) {
                await this.sendSignalingMessage(connection, {
                    type: 'ice-candidate',
                    candidate: event.candidate
                });
            }
        };

        this.connections.set(peerId, { connection, peerConnection });
        return peerConnection;
    }

    async sendSignalingMessage(connection, message) {
        const stream = await connection.newStream('/webrtc-signaling/1.0.0');
        await stream.sink([new TextEncoder().encode(JSON.stringify(message))]);
    }

    async connectToPeer(peerId) {
        try {
            console.log('Attempting to connect to peer:', peerId);
            
            const connections = this.node.getConnections();
            const relayConnection = connections[0];
            
            if (!relayConnection) {
                throw new Error('Not connected to relay');
            }

            // const relayPeerId = relayConnection.remotePeer.toString();
            // const peerAddr = multiaddr(`/ip4/127.0.0.1/tcp/9090/ws/p2p/${relayPeerId}/p2p-circuit/p2p/${peerId}`);
            const relayAddr = relayConnection.remoteAddr;
            const peerAddr = multiaddr(`${relayAddr}/p2p-circuit/webrtc/p2p/${peerId}`);
            
            console.log('Connecting through relay:', peerAddr.toString());
            
            const connection = await this.node.dial(peerAddr);
            console.log('Connected to peer via relay');

            if (this.localStream) {
                const peerConnection = this.createPeerConnection(peerId, connection);
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                await this.sendSignalingMessage(connection, {
                    type: 'offer',
                    sdp: offer
                });
            }

            return connection;
        } catch (err) {
            console.error('Failed to connect to peer:', err);
            throw err;
        }
    }

    async startMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            return this.localStream;
        } catch (err) {
            console.error('Error accessing media devices:', err);
            throw err;
        }
    }

    async stopMedia() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }

    async disconnect() {
        await this.stopMedia();
        for (const [, conn] of this.connections) {
            if (conn.peerConnection) {
                conn.peerConnection.close();
            }
            if (conn.connection) {
                conn.connection.close();
            }
        }
        this.connections.clear();
        if (this.node) {
            await this.node.stop();
        }
    }
}

export default P2PClient;