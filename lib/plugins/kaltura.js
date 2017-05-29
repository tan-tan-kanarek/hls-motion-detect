/**
 * http://usejsdoc.org/
 */

const kaltura = require('kaltura');

class Kaltura extends EventEmitter {

    constructor(detectServer) {
        super();

        this.detectServer = detectServer;

        detectServer
        .on('source-added', (source) => {
            source.on('record-stop', (filepath) => {
            	
            });
        });
    }
}