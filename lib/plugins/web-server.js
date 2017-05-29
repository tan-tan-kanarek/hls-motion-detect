/**
 * http://usejsdoc.org/
 */

const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const EventEmitter = require('events');

const Source = require('../source.js');

class WebServer extends EventEmitter {

	constructor(detectServer){
		super();
		
		this.detectServer = detectServer;
	}
	
	listen(options) {
		const app = express();
		var webServerOptions = {
			key: options.key,
			cert: options.cert
		};

		let This = this;
		let webServer = http.createServer(app).listen(options.port, () => {
			This.emit('listen', options.port);
		});
		app.use(express.static(options.path));

		let io = socketIO(webServer);
		io.on('connection', (socket) => {
			This.handleConnection(socket);
		});

		this.detectServer
		.on('source-added', (source) => {
			io.sockets.emit('source-added', source);
		})
		.on('source-removed', (systemName) => {
			io.sockets.emit('source-removed', systemName);
		});
		
		return this;
	}
	
	handleConnection(socket) {
		let This = this;
				
		socket.on('error', (err) => {
			console.error('Socket.io error:', err);
		});

		socket.on('add', (sourceData) => {
			
			let {systemName, name, sourceURL} = sourceData;

			if(!systemName || !systemName.length) {
				return socket.emit('errorMessage', 'Missing parameter [systemName]');
			}
			if(!name || !name.length) {
				return socket.emit('errorMessage', 'Missing parameter [name]');
			}
			if(!sourceURL || !sourceURL.length) {
				return socket.emit('errorMessage', 'Missing parameter [sourceURL]');
			}

			let source = new Source(sourceData);
			source.name = name;
			This.detectServer.addSource(source);
		});

		socket.on('list', () => {
			socket.emit('list', This.detectServer.listSources());
		});

		socket.on('follow', (systemName) => {
			let source = This.detectServer.getSource(systemName);
			
			source
			.on('start', () => {
				socket.emit('start', systemName);
			})
			.on('stop', () => {
				socket.emit('stop', systemName);
			})
			.on('record-start', (filepath) => {
				socket.emit('record-start', systemName, source.sourceURL);
			})
			.on('record-stop', () => {
				socket.emit('record-stop', systemName);
			});
		});

		socket.on('start', (systemName) => {
			let source = This.detectServer.getSource(systemName);
			source.start();
		});

		socket.on('stop', (systemName) => {
			let source = This.detectServer.getSource(systemName);
			source.stop();
		});

		socket.on('start-record', (systemName) => {
			let source = This.detectServer.getSource(systemName);
			source.startRecording();
		});

		socket.on('stop-record', (systemName) => {
			let source = This.detectServer.getSource(systemName);
			source.stopRecording();
		});

		socket.on('remove', (systemName) => {
			This.detectServer.removeSource(systemName);
		});
	}

}

module.exports = WebServer;