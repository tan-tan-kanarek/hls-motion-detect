
/* jshint -W079 */

const url = require('url');
const amqp = require('amqplib');
const Promise = require('bluebird');
const EventEmitter = require('events');

const Source = require('../source.js');

class RabbitServer extends EventEmitter {

    constructor(detectServer) {
        super();

        this.detectServer = detectServer;

        detectServer
            .on('source-added', (source) => {
                source.on('idle', () => {
                    detectServer.removeSource(source.systemName);
                });
            });
    }

    listen(options) {
        if (!options.host) {
            throw 'Option host is missing';
        }
        if (!options.queue) {
            throw 'Option queue is missing';
        }

        let This = this;

        options.protocol = 'amqp:';
        options.slashes = true;
        
        let amqpUrl = url.format(options);

        amqp.connect(amqpUrl)
        .then((connection) => {
            process.once('SIGINT', () => {
            	connection.close();
            });
            
            return connection.createChannel()
            .then((channel) => {
                return channel.assertQueue(options.queue, {
                    durable : true
                })
                .then(() => {
                    return channel.consume(options.queue, function(msg) {
                    	try{
                    		This.handle(JSON.parse(msg.content.toString()));
                    	}
                    	catch(err) {
                    		This.emit('error', err);
                    	}
                    }, {
                        noAck : true
                    });
                })
                .then(() => {
                	This.emit('listen');
                });
            });
        })
        .catch((err) => {
        	This.emit('error', err);
        });

        return this;
    }

    handle(sourceData) {
		let {systemName, name, sourceURL, sourcePath} = sourceData;
		
		if(!systemName) {
			throw 'Missing parameter [systemName]';
		}
		if(!sourceURL) {
			throw 'Missing parameter [sourceURL]';
		}
		if(!name) {
			name = systemName;
		}

		let source = new Source(sourceData);
		source.name = name;
		try{
			this.detectServer.addSource(source)
			source.start();
		}
		catch(err) {
			this.emit('error', err);
		}
    }
}

module.exports = RabbitServer;