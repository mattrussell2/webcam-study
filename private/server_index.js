/*
 * @file: server_index.js 
 * @author: Matt Russell
 * @description: Logic used to establish a peer connection with the server, and to receive
 *               and record the webcam data sent over peerjs. 
 * @notes: Config variables at the top need to be filled in with Heroku secrets or the like.
 */

const peers        = {};
const PEER_HOST_ID = '';

const PEERJS_SERVER_HOST   = '';
const PEERJS_PATH          = '';
const TURN_SERVER_HOST     = '';
const TURN_SERVER_USERNAME = '';
const TURN_SERVER_PASSWORD = '';
const TURN_SERVER          = { url: TURN_SERVER_HOST, username: TURN_SERVER_USERNAME , credential: TURN_SERVER_PASSWORD };
const STUN_SERVER          = { url: "stun:stun.l.google.com:19302" };

/*
 * log the current time with an optional message. 
 */
const log = (message="") => { console.log(new Date(Date.now()) + " - " + message); }

/*
 * Reload the page every day to clear the cache. 
 * Keep connection alive by checking every second.
 */
setInterval(
    function() {
        const d = new Date(Date.now());
        if (d.getHours() == 0 && d.getMinutes() == 3 && d.getSeconds() < 10) {
            log("RELOADING PAGE");
            window.location.reload();
        }
    }, 1000);

/*
 * @function: savedata
 * @param: peerID - the peerjs id of the participant
 * @description: downloads the webcam stream of the given user
 * @notes: works by creating a link to the video blob, adding it to the html page, and 'clicking' it.
 */ 
function savedata(peerID){
    log("saving data");             
    
    var blob = new Blob(peers[peerID].chunks, { type: 'video/webm' } );
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    document.body.appendChild(a);
    a.style    = 'display: none';
    a.href     = url;
    a.download = peers[peerID].uuid + '_' + peers[peerID].video + '.webm';
    a.click();
    window.URL.revokeObjectURL(url); 
}

/* 
 * Establish the connection to the peerjs server
 * We open the connection, start a heartbeat to keep it alive.
 */
var peer = new Peer(
    PEER_HOST_ID,
    {
        host: PEERJS_SERVER_HOST,
        path: PEERJS_PATH,
        debug: 2, 
        config: {
            'iceServers': [ STUN_SERVER, TURN_SERVER ]
        }
    }
);
 
peer.on('open', function(id) {          
    console.log('My peer ID is: ' + id); 

    peerInterval = setInterval( () => {
        if (peer.socket._wsOpen()) {
            peer.socket.send({ type: 'HEARTBEAT' });
        }
    }, 20000);    
})

/*
 * A participant initates a call with their webcam via peerjs
 */
peer.on('call', function(call) {
    log("received call");
    log("metadata: " + call.metadata);

    if (call.peer in peers && call.metadata.video === "STOP_VIDEO" || 
                              call.metadata.video === "STOP_STUDY") {
        peers[call.peer].recorder.stop();
        savedata(call.peer);
        return; 
    }

    // save the call to reference it later
    // overwrite any current instance for the given participant
    if (call.peer in peers) {
        uuid = peers[call.peer].uuid;
    } else {
        uuid = call.metadata.uuid;
    }

    peers[call.peer] = { 
                            call:     call, 
                            chunks:   [],
                            recorder: null , 
                            video:    call.metadata.video,
                            uuid:     uuid
                        }

    call.answer(); // needed to complete the connection

    if (call.metadata.video === "START_STUDY") { return; }

    // when webcam stream comes through, create a mediarecorder obj
    // and add callback to push chunks of data as they come through
    // note that start stream has not occurred yet.
    call.on('stream', function(stream){   
        log("stream received");
                            
        peers[call.peer].recorder = new MediaRecorder(stream);
        peers[call.peer].recorder.addEventListener('error', (event) => {
            log(`error recording stream: ${event.error.name}`);
        });

        peers[call.peer].recorder.addEventListener('dataavailable', event => {
            log('data available');
            if (typeof event.data === 'undefined' || event.data.size === 0) {
                log('event.data === undefined or event.data.size === 0');
                return;
            } 
            peers[call.peer].chunks.push(event.data);                    
        });   
        
        peers[call.peer].recorder.start(500); 
        
    });

    // these are currently broken (bugs in peerjs)
    call.on('close', function() { log("call closed"); });
    call.on('error', function() { log("call error"); });
});

peer.on('error', function(err) {
    log("PEERJS ERR: " + err);
})

peer.on('close', function() {
    log("PEERJS CONNECTION CLOSED: RECONNECTING");
    peer.reconect();
})

peer.on('disconnected', function() {
    log("PEERJS CONNECTION DISCONNECTED - TRYING TO RECONNECT");
    peer.reconnect();
})
