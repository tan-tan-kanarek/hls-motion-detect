
/* jshint -W079 */


const url = require('url');
const Promise = require('bluebird');
const Tortoise = require('tortoise')
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

        this.tortoise = new Tortoise(amqpUrl);
        this.tortoise
        .queue(options.queue, {
        	durable : true,
        	autoDelete: true
        })
        .json()
        .subscribe(function(msg, ack) {
        	console.dir(msg);
        	This.handle(msg);
        })

        this.emit('listen');

        return this;
    }

    handle(sourceData) {
        let {systemName, name, sourceURL, sourcePath} = sourceData;

        if (!systemName) {
            throw 'Missing parameter [systemName]';
        }
        if (!sourceURL) {
            throw 'Missing parameter [sourceURL]';
        }
        if (!name) {
            name = systemName;
        }

        sourceData.ffmpegPath = this.detectServer.ffmpegPath;
        sourceData.ffprobePath = this.detectServer.ffprobePath;

        let source = new Source(sourceData);
        source.name = name;
        if (sourceData.options) {
            source.options = sourceData.options;
        }
        try {
            this.detectServer.addSource(source)
            source.start();
        } catch (err) {
            this.emit('error', err);
        }
    }
}

module.exports = RabbitServer;