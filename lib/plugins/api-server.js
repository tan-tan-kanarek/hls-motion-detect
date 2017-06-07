
/* jshint -W079 */

const util = require('util');
const http = require('http');
const Promise = require('bluebird');
const queryString = require('querystring');
const EventEmitter = require('events');

const Source = require('../source.js');

class ApiServer extends EventEmitter {
	
	constructor(detectServer){
		super();
		
		this.detectServer = detectServer;
		this.services = {
			source: SourceController
		};
		this.servicesInstances = {};
	}
	
	listen(port) {
		let This = this;
		http.createServer((httpRequest, httpResponse) => This.handler(httpRequest, httpResponse))
		.listen(port, () => {
			This.emit('listen', port);
		});
		
		return this;
	}
	
	handler(httpRequest, httpResponse) {
		let This = this;
		
		this.parse(httpRequest)
		.then(({service, action, params}) => This.execute(service, action, params),
		(exception) => { 
			httpResponse.writeHead(200, {'Content-Type': 'application/json'});
			httpResponse.end(JSON.stringify(exception));
		})
		.then((response) => {
			This.emit('debug', 'Request [' + httpRequest.url + '], response: ' + util.inspect(response));
			
			httpResponse.writeHead(200, {'Content-Type': 'application/json'});
			httpResponse.end(JSON.stringify(response));
		}, 
		(exception) => {
			This.emit('error', 'Request [' + httpRequest.url + '], error: ');
			This.emit('error', exception);
			
			exception.objectType = 'KalturaAPIException';
			
			httpResponse.writeHead(200, {'Content-Type': 'application/json'});
			httpResponse.end(JSON.stringify(exception));
		})
		.catch((err) => {
			This.emit('error', 'Request [' + httpRequest.url + '], catch: ');
			This.emit('error', err);
			httpResponse.writeHead(500, {'Content-Type': 'application/json'});
			let response = {
				code : 'INTERNAL_SERVER_ERROR',
				message : 'Internal server error',
				objectType : 'KalturaAPIException'
			};
			httpResponse.end(JSON.stringify(response));
		});
	}
	
	parse(httpRequest) {
		let This = this;
		
		return new Promise((resolve, reject) => {
			let matches = httpRequest.url.match(/\/([^\/]+)\/([^\/?]+)\/?([^?]*)(\?.+)?$/i);
			if(matches === null) {
				reject({
					code : 'INVALID_URL',
					message : 'Invalid URL',
					objectType : 'KalturaAPIException'
				});
				return;
			}

			let [, service, action, paramsString, query] = matches;
			let params = queryString.parse(query);
			let paramsParts = paramsString.split('/');
			while(paramsParts.length > 1) {
				params[paramsParts.shift()] = paramsParts.shift();
			}
			let args = {
				service: service, 
				action: action, 
				params: params
			};

			if(!This.services || !This.services[service]) {
				reject({
					code : 'SERVICE_NOT_FOUND',
					message : 'Service [' + service + '] not found',
					objectType : 'KalturaAPIException',
					args: {
						SERVICE : service
					}
				});
				return;
			}
			
			if(!This.services[service].prototype[action]) {
				reject({
					code : 'ACTION_NOT_FOUND',
					message : 'Action [' + service + '.' + action + '] not found',
					objectType : 'KalturaAPIException',
					args: {
						SERVICE : service,
						ACTION : action
					}
				});
				return;
			}
			
			if(httpRequest.headers['content-type'].toLowerCase().startsWith('application/json')) {
				let rawData = '';
				httpRequest.on('data', function (chunk) {
			    	rawData += chunk;
			    });
				httpRequest.on('end', function (chunk) {
			    	let data = JSON.parse(rawData);
			    	args.params = Object.assign(data, args.params);
					resolve(args);
			    });
			}
			else {
				resolve(args);
			}
		});
	}
	
	execute(service, action, params) {
		this.emit('debug', 'Executing [' + service + '.' + action + ']: ' + util.inspect(params));
		let serviceInstance;
		if(this.servicesInstances[service]) {
			serviceInstance = this.servicesInstances[service];
		}
		else {
    		serviceInstance = new this.services[service](this.detectServer);
    		this.servicesInstances[service] = serviceInstance;
		}
		
		return new Promise((resolve, reject) => {
			try{
				let response = serviceInstance[action].apply(serviceInstance, [params]);
				Promise.resolve(response).then((response) => {
					resolve(response);
				}, (err) => {
					reject(err);
				});
			}
			catch(e) {
				reject(e);
			}
		});
	}
}

class SourceController {

	constructor(detectServer){
		this.detectServer = detectServer;
	}
	
	add(sourceData) {
		
		let {systemName, name, sourceURL, sourcePath} = sourceData;
		
		if(!systemName) {
			let err = new Error();
			err.message = 'Missing parameter [systemName]';
			err.code = 'MISSING_PARAMETER';
			throw err;
		}
		if(!sourceURL) {
			let err = new Error();
			err.message = 'Missing parameter [sourceURL]';
			err.code = 'MISSING_PARAMETER';
			throw err;
		}
		if(!name) {
			name = systemName;
		}

		sourceData.ffmpegPath = this.detectServer.ffmpegPath;
		sourceData.ffprobePath = this.detectServer.ffprobePath;

		let This = this;
		return new Promise((resolve, reject) => {
			try{
				let source = new Source(sourceData);
				source.name = name;
				if(sourceData.options) {
					source.options = sourceData.options;
				}
				This.detectServer.addSource(source)
				resolve(source);
			}
			catch(err) {
				reject(err);
			}
		});
	}
	
	delete({systemName}) {

		if(!systemName) {
			let err = new Error();
			err.message = 'Missing parameter [systemName]';
			err.code = 'MISSING_PARAMETER';
			throw err;
		}

		let This = this;
		return new Promise((resolve, reject) => {
			try{
				This.detectServer.removeSource(systemName)
				resolve(null);
			}
			catch(err) {
				reject(err);
			}
		});
	}
	
	list() {
		
	}
	
	start({systemName, interval, x, y, width, height, threshold, maxIdleTime}) {
		if(!systemName) {
			let err = new Error();
			err.message = 'Missing parameter [systemName]';
			err.code = 'MISSING_PARAMETER';
			throw err;
		}

		if(!interval || interval < 1) {
			interval = 1;
		}

		let This = this;
		return new Promise((resolve, reject) => {
			try{
				This.detectServer.startDetection(systemName, interval, x, y, width, height, threshold, maxIdleTime)
				resolve(null);
			}
			catch(err) {
				reject(err);
			}
		});
	}
	
	stop({systemName}) {
		
	}
}

module.exports = ApiServer;