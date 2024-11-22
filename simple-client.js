import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { webRTC } from '@libp2p/webrtc'
import { multiaddr } from '@multiformats/multiaddr'
import { identify } from '@libp2p/identify'
import { yamux } from '@chainsafe/libp2p-yamux'

async function main() {
    const client = await createLibp2p({
        addresses: {
            listen: ['/webrtc']
        },
        transports: [
            webSockets(),
            webRTC(),
            circuitRelayTransport()
        ],
        connectionEncrypters: [noise()],  // Changed from connectionEncryption
        streamMuxers: [yamux()],         // Add stream muxer
        services: {
            identify: identify()
        }
    })

    await client.start()  // Make sure to start the node
    
    try {
        const relayAddr = multiaddr('/ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooWHFQBMe5gEbKmyUBnwPZkHEuigeLnZ1WbEKmv3S7GHqkH')
        console.log(relayAddr);
        await client.dial(relayAddr)
        console.log('Connected to relay!')
        console.log('My peer ID:', client.peerId.toString())
    } catch (err) {
        console.error('Failed to connect:', err)
    }
}

main().catch(console.error)