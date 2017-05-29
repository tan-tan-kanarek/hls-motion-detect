
/* jshint -W079 */

const fs = require('fs');
const url = require('url');
const tmp = require('tmp');
const http = require('http');
const https = require('https');
const Promise = require('bluebird');
const childProcess = require('child_process');
const EventEmitter = require('events');

if (typeof Array.prototype.clone !== 'function') {
    Array.prototype.clone = function() {
    	return this.slice(0);
    };
}

if (typeof String.prototype.exec !== 'function') {
	String.prototype.exec = function(callback, errorCallback, verbose) {
		var cmd = this;
		var process = childProcess.exec(cmd, {maxBuffer: 1024 * 500}, function (error, stdout, stderr) {
			if(verbose) {
    			console.log('Command: ' + cmd);
    			if(stdout.length){
    				console.log('Standard output: ' + stdout);
    			}
    			
    			if(stderr.length){
    				console.log('Standard error: ' + stderr);
    			}
			}
			
		    if (error) {
		    	if(errorCallback){
		    		errorCallback(error, stdout, stderr);
		    	}
		    	else{
		    		var exception = new Error(error.message);
		    		console.error(exception);
		    	}
		    }
		    else if(callback){
		    	callback(stdout, stderr);
		    }
		});
		
		if(verbose) {
			console.log('Started cli process [' + process.pid + ']: ' + cmd);
		}
		return process;
	};
}

class Source extends EventEmitter {

	constructor({systemName, sourceURL, sourcePath}){
		super();

		this.systemName = systemName;
		this.sourceURL = sourceURL;
		this.sourcePath = sourcePath; // TODO handle path differently

		this.running = false;
		this.recording = false;

		this.segments = [];
		this.backupSegments = [];
		this.segmentSequence = 0;
		this.segmentDuration = 3;
		this.lastSegment = null;
		this.lastSegmentTime = 0;
		this.lastImage = null;
		this.nextOffset = 0;

		this.keepSegmentsCount = 3;
		this.threshold = 35;
		this.interval = 1;
		this.x = null;
		this.y = null;
		this.width = null;
		this.height = null;
		this.maxIdleTime = 30;
		
		this.recordingProcess = null;
	}
	
	isRunning() {
		return this.running;
	}
	
	startRecording(delay) {
		this.recording = true;
		this.segments = this.backupSegments.clone();
		this.emit('record', delay);
	}
	
	stopRecording() {
		this.recording = false;
		this.emit('unrecord');
	}
	
	start(interval, x, y, width, height, threshold, maxIdleTime){
		if(interval) {
			this.interval = interval;
		}
		if(x) {
			this.x = x;
		}
		if(y) {
			this.y = y;
		}
		if(width) {
			this.width = width;
		}
		if(height) {
			this.height = height;
		}
		if(threshold) {
			this.threshold = threshold;
		}
		if(maxIdleTime) {
			this.maxIdleTime = maxIdleTime;
		}
		
		this.running = true;
		this.detect();
		this.emit('start');
	}

	redetect(){
		let This = this;
		setTimeout(() => {
			This.detect();
		}, This.interval * 1000);
	}

	detect(){
		let This = this;

		This.detectNextSegments()
		.then((segments) => {
			if(segments.length) {
    			This.processSegments(segments)
    			.then(() => {
    				This.redetect();
    			});
			}
			else {
	    		let d = new Date();
	    		let now = d.getTime();
	    		let idleTime = now - This.lastSegmentTime;
				if(idleTime < (This.maxIdleTime * 1000)) {
					This.redetect();
				}
				else {
					This.emit('idle', idleTime);
				}
			}
		}, (err) => {
			This.redetect();
		});
	}

	keepSegment(segment){
		while(this.backupSegments.length >= this.keepSegmentsCount) {
			this.segmentSequence++;
			this.backupSegments.shift();
			if(this.recording) {
				this.segments.shift();
			}
		}
		
		this.backupSegments.push(segment);
		if(this.recording) {
			this.segments.push(segment);
		}
	}

	processSegments(segments){
		let This = this;
		let sequence = Promise.resolve();
		
		segments.forEach((segment) => {
			This.keepSegment(segment);
			sequence = sequence.then(() => {
				return This.processSegment(segment);
			});
		});
		
		return sequence;
	}

	processSegmentFrames(frames){
		let This = this;
		
		return new Promise((resolve, reject) => {
			let firstFrame = parseFloat(frames[0].pkt_dts_time);
			let keyFrames = frames.filter((frame) => {
				if(!frame.key_frame) {
					return false;
				}
				
				let time = parseFloat(frame.pkt_pts_time);
				if(!This.nextOffset || time > This.nextOffset) {
					This.nextOffset = time + This.interval;
					return true;
				}
				
				return false;
			})
			.map((frame) => {
				return parseFloat(frame.pkt_pts_time) - firstFrame;
			});
			resolve(keyFrames);
		});
	}

	processVideo(filepath){
		return new Promise((resolve, reject) => {
    		let cmd = `C:/opt/kaltura/bin/ffmpeg-3.2/bin/ffprobe -show_frames -print_format json ${filepath}`;
    		cmd.exec((stdout, stderr) => {
    			resolve(JSON.parse(stdout).frames);
    		});
		});
	}

	compareImage(image) {
		let This = this;
		return new Promise((resolve, reject) => {
			if(!This.lastImage) {
				This.lastImage = image;
				resolve();
			}
			else {
				let tmpImage = `${image}.cmp`;
				let lastImage = This.lastImage;
				This.lastImage = image;
				
				let compare = (diff) => {
//					console.log(diff);
					if(diff > 1 && diff < This.threshold){
						This.emit('motion', diff);
					}
					fs.unlink(tmpImage, (err) => {});
					resolve();
				}
				
				let cmd = `compare -metric PSNR ${lastImage} ${image} ${tmpImage}`; // TODO apply x, y, width and height
				cmd.exec((stdout, stderr) => {
					compare(parseFloat(stderr));
	    		}, (err, stdout, stderr) => {
	    			if(isNaN(stderr)) {
		    			compare(1);
	    			}
	    			else {
	    				compare(parseFloat(stderr));
	    			}
	    		});
			}
		});
	}

	compareImages(images) {
		let This = this;
		let sequence = Promise.resolve();
		
		images.forEach((image) => {
			sequence = sequence.then(() => {
				return This.compareImage(image);
			});
		});
		
		return sequence;
	}
	
	captureImages(videoPath, keyFrames) {
		let This = this;
		let sequence = Promise.resolve();
		let images = [];
		
		keyFrames.forEach((keyFrame) => {
			sequence = sequence.then(() => {
				let imagePath = `${videoPath}.${images.length}.jpg`;
				images.push(imagePath);
				return This.captureImage(videoPath, imagePath, keyFrame);
			});
		});
		
		return sequence.then(() => {
			return new Promise((resolve, reject) => {
				resolve(images);
    		});
		});
	}

	captureImage(videoPath, imagePath, keyFrame){
		return new Promise((resolve, reject) => {
			let cmd = `ffmpeg -i ${videoPath} -ss ${keyFrame} -vframes 1 ${imagePath}`;
			cmd.exec((stdout, stderr) => {
				resolve();
    		});
		});
	}

    downloadSegment(response, filepath){
    	return new Promise((resolve, reject) => {
        	const ws = fs.createWriteStream(filepath);
    		response.pipe(ws);
    		response.on('end', () => {
        		resolve();
        	});
    	});
    }

	createTempFile(){
		return new Promise((resolve, reject) => {
	    	tmp.file((err, filepath, fd, cleanupCallback) => {
	    		resolve({
	    			path: filepath, 
	    			callback: cleanupCallback
	    		});
	    	});
		});
	}

	requestSegment(segment){
		return new Promise((resolve, reject) => {
    		var opts = url.parse(segment);
    	    opts.headers = {
    	      'User-Agent': 'javascript'
    	    };
    	    
    	    let httpModule = http;
    	    if(opts.protocol === 'https:') {
    	    	httpModule = https;
    	    }
    
    		httpModule.get(opts, (response) => {
    			resolve(response);
    	    }).on('error', (e) => {
    	    	throw `Got error: ${e.message}`;
    	    }).end();
		});
			
	}

	processSegment(segment){
		let This = this;
		
		return new Promise((resolve, reject) => {
				
			let filepath;
			let cleanupCallback;
			
    		This.createTempFile()
    		.then(({path, callback}) => {
    			filepath = path;
    			cleanupCallback = callback;
    			
    			return This.requestSegment(segment);
    		})
    		.then((response) => {
    			return This.downloadSegment(response, filepath);
    		})
    		.then((frames) => {
    			return This.processVideo(filepath);
    		})
    		.then((frames) => {
    			return This.processSegmentFrames(frames);
    		})
    		.then((keyFrames) => {
    			return This.captureImages(filepath, keyFrames);
    		})
    		.then((images) => {
    			return This.compareImages(images);
    		})
			.then((images) => {
	    		This.lastSegment = segment;
	    		let d = new Date();
	    		this.lastSegmentTime = d.getTime();
	    		resolve();
	    		cleanupCallback();
			});
		});
	}

	parseM3U8(rawData){
        let lines = rawData.split('\n');
        let segments = [];
        for(let i = 0; i < lines.length; i++) {
        	if(lines[i].match(/^#EXT-X-TARGETDURATION:[\d.]+$/)) {
        		this.segmentDuration = parseInt(lines[i].split(':')[1]);
        	}
        	if(lines[i].match(/^#EXTINF:[\d.]+,$/) || lines[i].match(/^#EXT-X-STREAM-INF:$/)) {
        		segments.push(url.resolve(this.sourceURL, lines[i + 1]));
        	}
        }
        
        return segments;
	};
	
	getM3U8(){
		let This = this;
		
		return new Promise((resolve, reject) => {
			let request = http.get(This.sourceURL, function(response){
    			if(response.statusCode === 404) {
    				reject('Source [' + This.sourceURL + '] status code: ' + response.statusCode);
    				return;
    			}
    
    			response.setEncoding('utf8');
    			let rawData = '';
    	        response.on('data', function(chunk){
    	        	rawData += chunk;
    	        });
    	        response.on('end', function(){
    	        	resolve(rawData);
    	        });
    		});
    		
    		request.on('error', function(e){
    			reject(e);
    		});
    		
    		request.on('timeout', function(e){
    			request.abort();
    			reject('Source [' + This.sourceURL + '] request timeout');
    		});
    		
    		request.setTimeout(3000);
		});
	};
	
	detectNextSegments(){
		let This = this;

		return new Promise((resolve, reject) => {
			This.getM3U8()
    		.then((m3u8) => {
    			let segments = This.parseM3U8(m3u8);
    			if(This.lastSegment === null) {
    				resolve([segments.pop()]); // return only last segment
    			}
    			else {
    				let nextSegment = segments.shift();
    				let allSegments = [nextSegment];
    				while(nextSegment !== This.lastSegment) {
        				nextSegment = segments.shift();
        				allSegments.push(nextSegment);
    				}
    				if(nextSegment === This.lastSegment) {
    					resolve(segments);
    				}
    				else {
    					resolve(allSegments);
    				}
    			}
    		}, (err) => {
    			reject(err);
    		});
		});
	}
	
	stop(){
		this.running = false;
		this.emit('stop');
	}
}

module.exports = Source;