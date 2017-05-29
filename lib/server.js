
/* jshint -W079 */

const fs = require('fs');
const http = require('http');
const Promise = require('bluebird');
const EventEmitter = require('events');

class RecordingServer extends EventEmitter {
	constructor(){
		super();
		this.sources = {};
	}
	
	// listen is required for recording as ffmpeg is executed to pull the stream with this server URL as input
	listen(port) {
		this.port = port;
		
		let This = this;
		http.createServer((httpRequest, httpResponse) => This.handler(httpRequest, httpResponse))
		.listen(port, () => {
			This.emit('listen', port);
		});
		
		return this;
	}
	
	getPort() {
		return this.port;
	}

	addSource(source) {
		let This = this;
		source
		.on('motion', (diff) => {
			source.startRecording(5);
		})
		.on('record', (delay) => {
			if(delay) {
				This.recordWithTimeLimit(source, delay);
			}
			else {
				This.startRecord(source);
			}
		})
		.on('unrecord', () => {
			if(source.recordTimer) {
				clearTimeout(source.recordTimer);
				source.recordTimer = null;
			}
		});
	}
	
	recordWithTimeLimit(source, delay) {
		let This = this;
		
		if(source.recordHandled) {
			return;
		}
		source.recordHandled = true;

		if(source.recordTimer) {
			clearTimeout(source.recordTimer);
			this.setStopRecordingDelay(source, delay)
			source.recordHandled = false;
		}
		else {
			This.startRecord(source)
			.then(() => {
    			This.setStopRecordingDelay(source, delay)
    			source.recordHandled = false;
			});
    	}
	}
	
	setStopRecordingDelay(source, delay) {
		let This = this;
		
		if(delay) {
    		source.recordTimer = setTimeout(() => {
    			source.recordTimer = null;
    			This.stopRecord(source);
    		}, delay * 1000);
		}
	}
	
	stopRecord(source) {
		source.stopRecording();
		source.recordTimer = null;
	}
	
	startRecord(source) {
		return new Promise((resolve, reject) => {
    		let directoryPath = `./recorded/${source.systemName}`;
    		fs.mkdir(directoryPath, () => {
    			let date = new Date();
    			let filepath = `${directoryPath}/${date.getTime()}.mp4`;
    
    			let sourceURL = `http://localhost:${this.port}/${source.systemName}`;
    			let cmd = `ffmpeg -i ${sourceURL} ${filepath}`;
    			
    			cmd.exec()
    			.on('exit', () => {
    				source.emit('record-stop', filepath);
    			});
    
    			source.emit('record-start', filepath);
    			
    			resolve();
    		});
		});
	}
	
	handler(httpRequest, httpResponse) {
		let This = this;
		
		this.getSystemName(httpRequest)
		.then((systemName) => This.getM3U8(systemName))
		.then((m3u8) => {
			This.emit('debug', 'Request [' + httpRequest.url + ']');
			
			httpResponse.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'});
			httpResponse.end(m3u8);
		})
		.catch((err) => {
			This.emit('error', 'Request [' + httpRequest.url + '], catch: ');
			This.emit('error', err);
			httpResponse.writeHead(500, {'Content-Type': 'application/json'});
			let response = {
				code : 'INTERNAL_SERVER_ERROR',
				message : 'Internal server error',
			};
			httpResponse.end(JSON.stringify(response));
		});
	}

	getM3U8(systemName) {
		if(!this.sources[systemName]) {
			throw `System name [${systemName}] not found`;
		}

		let source = this.sources[systemName];
		
		let response = [];
		response.push('#EXTM3U');
		response.push('#EXT-X-VERSION:3');
		response.push('#EXT-X-MEDIA-SEQUENCE:' + source.segmentSequence);
		response.push('#EXT-X-TARGETDURATION:' + source.segmentDuration);
		
		source.segments.forEach((segment) => {
			response.push(`#EXTINF:${source.segmentDuration}.000,`);
			response.push(segment);
		});

		if(!source.recording) {
			response.push('#EXT-X-ENDLIST');
		}

		return new Promise((resolve, reject) => {
			resolve(response.join('\n'));
		});
	}

	getSystemName(httpRequest) {
		let This = this;
		
		return new Promise((resolve, reject) => {
			let matches = httpRequest.url.match(/\/([^\/]+)$/i);
			if(matches === null) {
				reject({
					code : 'INVALID_URL',
					message : 'Invalid URL',
				});
				return;
			}

			let [, systemName] = matches;
			resolve(systemName);
		});
	}
	
}


class DetectServer extends RecordingServer {
	
	constructor(){
		super();
	}
	
	addSource(source) {
		if(this.sources[source.systemName]) {
			throw `System name [${source.systemName}] already exists`;
		}
		
		this.sources[source.systemName] = source;
		this.emit('source-added', source);

		super.addSource(source);
	}
	
	removeSource(systemName) {
		if(!this.sources[systemName]) {
			throw `System name [${systemName}] not found`;
		}

		this.sources[systemName].stopRecording();
		this.sources[systemName].stop();
		delete this.sources[systemName];
		this.emit('source-removed', systemName);
	}
	
	getSource(systemName) {
		if(!this.sources[systemName]) {
			throw `System name [${systemName}] not found`;
		}
		
		return this.sources[systemName];
	}
	
	listSources() {
		return this.sources;
	}
	
	startDetection(systemName, interval, x, y, width, height, threshold, maxIdleTime) {
		if(!this.sources[systemName]) {
			throw `System name [${systemName}] not found`;
		}
		if(this.sources[systemName].isRunning()) {
			throw `Source [${systemName}] already started`;
		}
		
		this.sources[systemName].start(interval, x, y, width, height, threshold, maxIdleTime);
	}
}

module.exports = DetectServer;