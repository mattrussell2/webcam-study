/*
 * @file: app.js 
 * @author: Matt Russell
 * @description: Express app which coordinates the study. Responsibilities are:
 *               Serving html files:
 *                      1) For a 'backend' client to receive participants' webcam data over peerjs
 *                          This would be loaded by a member of the study team; files are password protected                          
 *                      2) For the 'frontend' client (participant) to run the study
 *               Receiving metadata from qualtrics and coordinating it with the 'backend' client html page.
 *               Saving the metadata and webcam data over scp2. 
 * @notes: Config variables near the top need to be filled in with Heroku secrets or the like.
*/

const express = require('express')
const app     = express()
const http    = require('http').Server(app)
const io      = require('socket.io')(http, {serveClient:false})
const cors    = require('cors')
const path    = require('path')
const _uuid   = require('uuid')
const open    = require('open')   
const port    = process.env.PORT || 8001
const Client  = require('scp2').Client
const secure  = require('express-force-https')

app.use(express.urlencoded( { extended: true } ) )
app.use(express.json())
app.use(cors())
app.use(secure)
app.use(express.static(path.join(__dirname, 'public')))
http.listen(port)

/* =========================================
 *            CONFIG VARIABLES
 * =========================================
 */ 

// scp2 server address to send data files
const HOST   = '';
const USER   = '';
const PASS   = '';
const save_path_client = new Client( {
    host: HOST,
    username: USER,
    password: PASS
});

// basic auth on the server_index.html page
const SERVER_AUTH_USER = '';
const SERVER_AUTH_PASS = '';
const LOCAL_SAVE_PATH  = '';

// secret key for the uuid generation
const UUID_NAMESPACE = '';

// participants object to store metadata
const participants   = {};   
const get_uuid       = (name) => _uuid.v5(name, UUID_NAMESPACE);

/*
 * @function: 'connection'
 * @description: incoming socket.io connection event.
 * @notes: This is a connection initiatied by the participant's machine. 
 *         'register_user' will be the first message sent by the client, at which 
 *         point we create the uuid for the participant and save that participant's socket.
 */
io.on('connection', socket => {
    
    socket.on('register_user', (args) => {
        console.log("registering user - ARGS: " + args)
        let uuid = get_uuid(args.name.toLowerCase());
        participants[uuid] = { socket: socket, done: false, uuid: uuid };   
        socket.emit('uuid', uuid);
    });

})

/*
 * @function backendAuth
 * @description: Middleware function to authenticate the backend client
 */
const backendAuth = (req, res, next) => {
    const reject = () => {
        res.setHeader('www-authenticate', 'Basic');
        res.sendStatus(401);
    } 

    const authorization = req.headers.authorization;

    if (!authorization) {
        return reject();
    }

    const [username, password] = Buffer.from(authorization.replace('Basic ', ''), 'base64').toString().split(':')

    if (! (username === SERVER_AUTH_USER && password === SERVER_AUTH_PASS)) {
        return reject();
    }

    next();
};

/*
 * Static endpoints. '/private' folder is password protected.
 */
app.use('/private', backendAuth);
app.use('/private', express.static('private'));
app.use(express.static('public', { index: 'index.html' }));

/*
 * @function: save_data
 * @description: Save participant's metadata as a JSON file
 * @params: pdata - participant's metadata
 * @returns: none
 * @notes: make a deep copy of the data in order to drop the non-JSON serializable socket
 */
function save_data(pdata) { 

    let savedata = {};
    for ([key, val] of Object.entries(pdata)) {
        if (key != 'socket') {
            savedata[key] = val;
        }
    }
    
    savedata['stop_time'] = Date.now();

    save_path_client.write( 
        {
            destination: LOCAL_SAVE_PATH + pdata.uuid + ".json",
            content: Buffer.from(JSON.stringify(savedata))
        }, 
        function(err) {
            if (err) {
                console.log("error saving timestamps " + err);
            }
        }
    );
}

/*
 * =========================================
 *          QUALTRICS ENDPOINTS
 * =========================================
 */

/*
 * @endpoint: /get_uuid
 * @method: POST
 * @description: given a participant's name, lookup their uuid.
 * @returns: sends the participant's uuid back to the client, or 'failed' if the name is not found
 */
app.post('/get_uuid', (req, res) => {
    const uuid = get_uuid(req.body.name.toLowerCase());
    res.send( { uuid: Object.keys(participants).includes(uuid) ? uuid : 'failed' } );
    return;
})

/*
 * @endpoint: /qualtrics
 * @method: POST
 * @description: sends to us which video the participant watched.
 * @returns: "done" so that Qualtrics knows to continue. 
 * @effects: Save the metadata.
 */
app.post('/qualtrics', (req, res) => {
    let location = req.body.location
    let video    = req.body.video_name
    let uuid     = req.body.uuid

    console.log("received info from qualtrics")
    console.log("location: " + location)
    console.log("video: " + video)
    console.log("uuid: " + uuid)
    
    if (participants[uuid].done) { 
        res.send("done")
        return
    }  
    
    if (!(video in participants[uuid])) {
        participants[uuid][video] = { 
                                        'start_video': false, 
                                         'stop_video': false, 
                                      'start_emotion': false, 
                                      'stop_emotion': false,
                                         'start_quiz': false, 
                                          'stop_quiz': false
                                    }
    }

    // qualtrics sends each request 3x, only process the first
    if (participants[uuid][video][location] == false) {

        // note the time
        participants[uuid][video][location] = Date.now();

        // send metadata to the backend
        participants[uuid].socket.emit(location, video);
        
        save_data(participants[uuid]);

        // study is over, so save the json data
        if (location == 'end_study') {
            participants[uuid]['done'] == true;     
        }    
    }

    res.send("done");

});