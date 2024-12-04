/*
 * @file: index.js 
 * @author: Matt Russell
 * @description: This file is the main entry point for the client side of the application. 
 *               It is responsible for setting up the client side socket connection,
 *               the peer connection, and the webcam stream. It also contains the logic 
 *               for the client side of the survey, including the validation of the user's name,
 *               the generation of the survey header and introduction, and the logic for 
 *               starting the survey.
 *
 * @notes: Config variables at the top need to be filled in with Heroku secrets or the like.
 *         default google ICE server is used. 
 */

const PEERJS_SERVER_HOST   = '';
const PEERJS_PATH          = '';
const TURN_SERVER_HOST     = '';
const TURN_SERVER_USERNAME = '';
const TURN_SERVER_PASSWORD = '';
const TURN_SERVER          = { url: TURN_SERVER_HOST, username: TURN_SERVER_USERNAME, credential: TURN_SERVER_PASSWORD };
const STUN_SERVER          = { url: "stun:stun.l.google.com:19302" };

const IO_SERVER_HOST = '';
const QUALTRICS_URL  = '';

/* 
 * @function: start_webcam
 * @description: Request the webcam stream from the browser.
 * @returns: Promise that resolves to the webcam stream.
 */ 
async function start_webcam() {
    console.log("Requesting local stream");
    const opts = {
        audio: false,
        video: { width: 640, height: 480 }
    };
    return await navigator.mediaDevices.getUserMedia(opts);
}

var name_obj;
var uuid;
var peer_connection;
var stream;

/*
 * =========================================
 *          PEERJS CONNECTION SETUP
 * =========================================
 */

const peer = new Peer(uuid, {
    host: PEERJS_SERVER_HOST,
    path: PEERJS_PATH,
    config: {
        iceServers: [ STUN_SERVER, TURN_SERVER ]
    }
});

peer.on("open", function (id) {
    console.log("My peer ID is: " + id);
});

peer.on("error", function (err) {
    console.log("PEERJS ERROR: " + err);
});

peer.on("disconnected", function () {
    peer.reconnect();
});


/*
 * @function: startSurvey
 * @description: This function is called after the user enters their name and clicks 'continue'.
 *               It establishes the socket connection to the metadata server, and then 
 *               creates a connection to the peerjs backend client, sending the webcam video along. 
 *               We then pass the buck to the qualtrics. 
 */
function startSurvey() {
    validate_name();
    empty_html();
    
    /*
     * Establish data connection to the metadata server
     * When we receive a 'start_video' message, we will start the webcam stream over the 
     * peerjs connection. 
     */
    const conn = io(IO_SERVER_HOST);

    conn.on("connect", () => { console.log(conn.id); });
    conn.emit("register_user", { name: name_obj.value });

    /* 
     * When the connection is established (during the 'connect' event in the backend), 
     * the uuid will be sent back to the client. Once we get the uuid, start the webcam
     * and send the stream back over the peerjs connection. 
     */
    conn.on("uuid", uuid => {
        uuid = uuid;
        start_webcam().then(webcam => {
            peer.call("HostPeer", webcam, 
                        {
                            'metadata': {
                                'video': 'START_STUDY',
                                'uuid': uuid
                            }
                        });
            })['catch'](function (err) {
                alert("Could not acquire video stream. Please allow camera permissions, and refresh the page.");
            });
    });

    conn.on('start_video', (video) => {
        console.log("START VIDEO RECEIVED BY CLIENT");
        start_webcam().then(webcam => {
            peer.call("HostPeer", webcam, 
                        {
                            'metadata': {
                                    'video': video,
                                    'uuid': uuid
                                }
                        });
            })["catch"](function (err) {
                console.log("FOR SOME REASON SUCCESSIVE WEBCAM REQUEST FAILED" + err);
            });
    });

    conn.on("stop_video", () => {
        console.log("STOP VIDEO RECEIVED BY CLIENT");
        start_webcam().then(webcam => {
            peer.call("HostPeer", webcam, 
                    {
                        'metadata': {
                            'video': "STOP_VIDEO",
                            'uuid': uuid
                        }
                    });
        });
    });

    conn.on('start_emotion', () => {
        console.log("START EMOTION RECEIVED BY CLIENT");
    });

    conn.on("stop_emotion", () => {
        console.log("STOP EMOTION RECEIVED BY CLIENT");
    });

    conn.on("start_quiz", () => {
        console.log("START QUIZ RECEIVED BY CLIENT");
    });

    conn.on("stop_quiz", () => {
        console.log("STOP QUIZ RECEIVED BY CLIENT");
    });

    conn.on("stop_study", () => {
        console.log("STOP STUDY RECEIVED BY CLIENT");
        start_webcam().then(webcam => {
            peer.call("HostPeer", webcam, 
                    {   
                        'metadata': {
                            'video': 'STOP_STUDY',
                            'uuid': uuid
                        }
                    });
        })['catch'](function (err) {
            console.log("FOR SOME REASON SUCCESSIVE WEBCAM REQUEST FAILED" + err);
        });
    });

    conn.io.on('error', (err)  => console.log("SOCKET ERROR: " + err));
    conn.io.on('reconnect_error', (err) => console.log("SOCKET RECONNECT ERROR: " + err));
    conn.io.on("reconnect_failed", (err) => console.log("SOCKET RECONNECT FAILED: " + err));
    conn.on("disconnect", () => {
        console.log("SOCKET DISCONNECT RECEIVED; MANUALLY RECONNECTING");
        conn.connect();
    });

    start_qualtrics();
}

/* 
 * @function: onload
 * @description: This function is called when the page is loaded. It generates the header and intro, and
 *               checks to see if the current time is within the study window. If not, it alerts the user.
 */
window.onload = () => {
  if (!validate_time()) {
    alert("Our server undergoes scheduled maintenance between 11:00PM and 12:05AM ETC. Please return any other time! Thank you.");
    return;
  }
  generateHeader();
  generateIntro();
};

/* 
 * @function: generateHeader
 * @description: This function generates the header for the survey.
 */
function generateHeader() {
    const header = document.createElement('h2');
    header.innerHTML = "Human-Computer <br/> Interaction Lab";
    header.setAttribute("style", "position: fixed; top: 10px; right: 10px; text-align: right; margin-right: auto");
    document.getElementById("header").appendChild(header);
}

/*
 * @function: generateIntro
 * @description: This function generates the introduction to the survey.
 *               It asks the user to enter their name and click 'continue' to start the survey.
 *               It also lists the requirements for the study.
 */
function generateIntro() {
    const div = document.createElement('div');
    div.name  = "login";
    
    const intro_text     = document.createElement('b');
    intro_text.innerHTML = "Hello!<br></br> Thanks for joining us for this study.<br></br> To participate, you will need to:<br></br>1. Be on a desktop or laptop computer with an internet connection<br></br>2. Be at least 18 years of age<br></br>3. Be able to hear and see without impairment, and to use a computer with basic proficiency.<br></br>4. Consent to your webcam being on for the duration of the study<br></br>5. Be located in a well lit room, and have no identifying information in the background <br>- a blank wall is best, but, if that is not possible, specifically no photographs, images, or other visible identifiable information is allowed. Also, no other individuals should be visible by the webcam. <br></br>6. Be able to commit one continuous hour of your time to watching and reacting to videos, some of which will include emotionally charged content such as depictions of police brutality<br></br>7. Be located in the United States of America<br></br>8. Not be located in or reside in any of the following states: Illinois, Texas, New York.<br></br>";
    "9. Be using either a Chrome or Firefox browser.<br></br>";
    " By entering your full name and pressing 'continue', you  agree to these conditions. A further consent form will follow shortly (Please note that your data will not be shared with any third parties.) <br></br>";
    
    name_obj             = document.createElement("input");
    name_obj.type        = "TEXT";
    name_obj.placeholder = "Full Name";
    name_obj.style       = "text-align:center";
    name_obj.required    = true;
    name_obj.name        = 'name';
    
    const button     = document.createElement("button");
    button.innerHTML = "continue";
    button.id        = "btn";
    button.onclick   = startSurvey; 

    div.appendChild(intro_text);
    div.appendChild(document.createElement('br'));
    div.appendChild(name_obj);
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createElement('br'));
    div.appendChild(button);
    document.getElementById("center_frame").appendChild(div);
}

/* 
 * @function: clearDiv
 * @description: Clears the div element in the center of the page. 
 */ 
function clearDiv() {
    div = document.getElementById('center_frame');
    div.innerHTML = '';
}

/*
 * @function: empty_html
 * @description: Clears the header and center frame divs. 
 */
function empty_html() {
    document.getElementById("center_frame").innerHTML = '';
    document.getElementById("header").innerHTML = '';
    clearDiv();
}

/*
 * @function: start_qualtrics
 * @description: Loads the qualtrics page in an iframe. 
 */
function start_qualtrics() {
    document.getElementById("header").innerHTML = '';
    document.getElementById("center_frame").innerHTML = "<iframe src=\"" + QUALTRICS_URL + "\" style = \"height:100vh; width: 100vw; margin: auto;\"></iframe>";
}

/*
 * @function: validate_name
 * @description: Given a name string, validates that we don't have any non-alpha chars (or dots/dashes)
 */
function validate_name() {
    if (name_obj.value === '') {
        alert("Please enter your full name to continue");
        window.location.reload();
    } else {
        az_match = "^[A-Za-z\\s\\.-]+$";
        name_match = name_obj.value.match(az_match);
        if (name_match === null) {
            alert("Please enter only alphabetic characters in your name. Dots and dashes are accepted");
            window.location.reload();
        }
    }
}

/*
 * @function: validate_time
 * @description: Validates that the current time is within the study window. 
 */
function validate_time() {
    var date = new Date();
    var hours = date.getHours();
    var minutes = date.getMinutes();
    return hours != 23 && !(hours == 0 && minutes < 59);
}