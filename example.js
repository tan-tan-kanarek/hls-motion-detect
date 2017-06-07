
/* jshint -W079 */

const DetectServer = require('./lib/server.js');
const ApiServer = require('./lib/plugins/api-server.js');
const WebServer = require('./lib/plugins/web-server.js');
const RabbitServer = require('./lib/plugins/rabbit-mq-server.js');
const Kaltura = require('./lib/plugins/kaltura.js');

let detectServer = new DetectServer({
	ffmpegPath: 'ffmpeg', 
	ffprobePath: 'ffprobe', 
	recordingsPath: './recorded'
})
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


let apiServer = new ApiServer(detectServer)
.listen(1337)
.on('listen', (port) => {
	console.log(`REST API server running at port ${port}`);
}).
on('debug', (msg) => {
	console.log(msg);
}).
on('error', (msg) => {
	console.error(msg);
});


let webServer = new WebServer(detectServer)
.listen({
	port: 3888,
	path: './lib/plugins/web-server/web',
})
.on('listen', (port) => {
	console.log(`Web server running at port ${port}`);
});


let rabbitServer = new RabbitServer(detectServer)
.on('listen', () => {
	console.log('Rabbit-MQ server running');
}).
on('error', (msg) => {
	console.error(msg);
})
.listen({
//	auth: 'guest:guest',
	host: 'localhost',
//	port: 5672,
	queue: 'streams'
});


let kaltura = new Kaltura(detectServer, {
	partnerId: 123, // replace with your Kaltura account id
	secret: 'your secret here'
})
.on('error', (msg) => {
	console.error(msg);
})
.on('entry-created', (entry) => {
	console.log(`New entry [${entry.id}] uploaded`);
});

