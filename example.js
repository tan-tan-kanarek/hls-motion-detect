
/* jshint -W079 */

const DetectServer = require('./lib/server.js');
const ApiServer = require('./lib/plugins/api-server.js');
const WebServer = require('./lib/plugins/web-server.js');
const RabbitServer = require('./lib/plugins/rabbit-mq-server.js');

let detectServer = new DetectServer()
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
.listen({
//	auth: 'guest:guest',
	host: 'localhost',
//	port: 5672,
	queue: 'stream-queue'
})
.on('listen', () => {
	console.log('Rabbit-MQ server running');
}).
on('error', (msg) => {
	console.error(msg);
});