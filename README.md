# emojs

This is the basis for study code whereby consenting participants' webcam video data is captured. 

The code here
1) Integrates with a qualtrics study which makes POST calls to various endpoints specified in app.js
2) Requires a custom TURN server to be setup for the peerjs connection to work properly. 
3) Needs server_index.html and keep_alive_index.html to be loaded by the study team in order to accept the peerjs connections from participants and keep the peerjs server alive, respectively. 


This code was successfully used to run a user study under the now-closed Tufts IRB #0426. We acquired webcam data from 123 respondents while watching 6 videos which have been shown to elicit specific emotions (citation below). Study analysis is ongoing.

The study videos that we used are from the following research paper. 
```
Gilman, T. & Shaheen, Razan & Nylocks, Karin & Halachoff, Danielle & Chapman, Jessica & Flynn, Jessica & Matt, Lindsey & Coifman, Karin. (2017). A film set for the elicitation of emotion in research: A comprehensive catalog derived from four decades of investigation. Behavior Research Methods. 49. 10.3758/s13428-016-0842-x
```