

# Motion Detecttion Server
Watch Apple HTTP Live Stream (HLS) and record to disc mp4 files containing the captured motions.


## Usage


```javascript

const motion = require('hls-motion-detect');

let detectServer = new motion.DetectServer()
.listen(1336)
.on('source-added', (source) => {
	console.log(`New Source added [${source.systemName}] URL [${source.sourceURL}]`);
	
	source
	.on('start', (filepath) => {
		console.log(`Source [${source.systemName}] started`);
	})
	.on('stop', () => {
		console.log(`Source [${source.systemName}] stopped`);
	})
	.on('record-start', (filepath) => {
		console.log(`Source [${source.systemName}] started recording: ${filepath}`);
	})
	.on('record-stop', (filepath) => {
		console.log(`Source [${source.systemName}] stopped recording`);
	});
})
.on('source-removed', (systemName) => {
	console.log(`Source removed [${systemName}]`);
});


```

### Tools

To test Rabbit-MQ message, use utils/addRabbitMessage.js