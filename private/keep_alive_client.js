/*
 * @file: keep_alive_client.js 
 * @author: Matt Russell
 * @description: 'Dummy' client that keeps the peerjs server alive.
 * @notes: Config variables at the top need to be filled in with Heroku secrets or the like.
 */

const REMOTE_ID          = ''; 
const PEERJS_SERVER_HOST = '';
const PEERJS_PATH        = '';
const SERVER_HOST        = '';
const QUALTRICS_PAGE_URL = '';

const wait = ms => new Promise(res => setTimeout(res, ms));

async function start_webcam() {
    console.log('Requesting local stream');
    const constraints = { audio: false, video: { width: 640, height: 480 } };
    return await navigator.mediaDevices.getUserMedia(constraints);
}

var uuid;
var peer_connection;
var stream;

/*
 * Establish the peerjs connection
 */
const peer = new Peer(uuid, {
    host: PEERJS_SERVER_HOST,
    path: PEERJS_PATH
});    

peer.on('open', function(id) {
    console.log('My peer ID is: ' + id);            
    
    // create a data connection as well
    peer_connection = peer.connect(REMOTE_ID);
});

/*
 * Establish the socket connection to server and register our dummy name 'keep alive'
 */
const socket = io(SERVER_HOST)
socket.on("connect", () => { console.log(socket.id) } ) 
socket.emit('register_user', { name: 'keep alive' } )

/*
 * uuid will be passed back from server at register_user, start our webcam and send data back
 */
socket.on('uuid', (uuid) => {
    uuid = uuid;  

    start_webcam().then(stream => {  
        stream = stream;
        peer.call(remoteID, stream);
    });

})

socket.on('start_video', (video) => {
    console.log('START VIDEO RECEIVED BY CLIENT');
    peer_connection.send( ['start_video', video] );
})

socket.on('stop_video', (video) => {
    console.log('STOP VIDEO RECEIVED BY CLIENT');
    peer_connection.send( ['stop_video', video] );
})

socket.on('start_emotion', () => {
    console.log('START EMOTION RECEIVED BY CLIENT');        
})

socket.on('stop_emotion', () => {
    console.log('STOP EMOTION RECEIVED BY CLIENT');       
})

socket.on('start_quiz', () => {
    console.log('START QUIZ RECEIVED BY CLIENT');        
})

socket.on('stop_quiz', () => {
    console.log('STOP QUIZ RECEIVED BY CLIENT');        
})

socket.on('stop_study', () => {
    console.log('STOP STUDY RECEIVED BY CLIENT');
    peer_connection.send( ['stop_study'] );
})
   
document.getElementById('header').innerHTML = "";
document.getElementById('center_frame').innerHTML = 
'<iframe src="' + QUALTRICS_PAGE_URL + '"' +
' style = "height:100vh; width: 100vw; margin: auto;"></iframe>';
