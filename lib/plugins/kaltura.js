/**
 * http://usejsdoc.org/
 */

const fs = require('fs');
const path = require('path');
const kaltura = require('kaltura-client');
const dateformat = require('dateformat');
const EventEmitter = require('events');

class Kaltura extends EventEmitter {

    constructor(detectServer, options) {
        super();

        if(!options.partnerId) {
        	throw 'Option partnerId is required';
        }

        if(!options.secret && (!options.email || !options.password)) {
        	throw 'Either secret option or email and password options are required';
        }

        let config = new kaltura.Configuration();
        if(options.serviceUrl) {
            config.serviceUrl = serviceUrl;
        }
        this.client = new kaltura.Client(config);

        this.detectServer = detectServer;
        this.options = options;
        
        let This = this;
        
        this.startSession()
        .then(() => {
            detectServer
            .on('source-added', (source) => {
                source.on('record-stop', (filepath) => {
                	fs.stat(filepath, (err, stats) => {
                		This.createEntry(source, filepath, stats);
                	});
                });
            });
        });
    }
    
    startSession() {
        let This = this;
        
		return new Promise((resolve, reject) => {
        	if(This.options.secret) {
        		let userId = null;
        		let type = kaltura.enums.SessionType.USER;
        		let expiry = null;
        		let privileges = null;
        		
        		kaltura.services.session.start(This.options.secret, userId, type, This.options.partnerId, expiry, privileges)
            	.completion((success, ks) => {
            		if(!success){
            			reject(ks.message);
            			return;
            		}

            		This.client.setKs(ks);
            		resolve();
            	})
            	.execute(This.client);
        	}
        	else {
        		kaltura.services.user.loginByLoginId(This.options.email, This.options.password, This.options.partnerId, expiry, privileges)
            	.completion((success, ks) => {
            		if(!success){
            			reject(ks.message);
            			return;
            		}

            		This.client.setKs(ks);
            		resolve();
            	})
            	.execute(This.client);
        	}
		});
    }

    newEntryObject(source) {
    	let entryTemplate = {};
    	if(source.options && source.options.entryTemplate) {
    		entryTemplate = source.options.entryTemplate;
    	}
    	if(!entryTemplate.name) {
    		if(!entryTemplate.nameTemplate) {
    			entryTemplate.nameTemplate = `"${source.name}" - dd/mm/yyyy HH:MM:ss`;
    		}
    		let parts = entryTemplate.nameTemplate.split('"');
    		entryTemplate.name = '';
    		for(var i = 0; i < parts.length; i++) {
    			if(i % 2) {
    				entryTemplate.name += parts[i];
    			}
    			else if (parts[i].length) {
    				entryTemplate.name += dateformat(new Date(), parts[i]);
    			}
    		}

            console.log(`aaa: ${source.name}`);
            console.log(`bbb: ${entryTemplate.nameTemplate}`);
            console.log(`ccc: ${entryTemplate.name}`);
    	}
    	entryTemplate.mediaType = kaltura.enums.MediaType.VIDEO;
    	
    	return new kaltura.objects.MediaEntry(entryTemplate);
    }

    createEntry(source, filepath, stats) {
    	let entry = this.newEntryObject(source);
    	let uploadToken = new kaltura.objects.UploadToken({
    		fileName: path.basename(filepath),
    		fileSize: stats.size
    	});
    	let contentResource = new kaltura.objects.UploadedFileTokenResource({
    		token: '{1:result:id}'
    	});
    	
    	let multiRequest = kaltura.services.uploadToken.add(uploadToken)
		.add(kaltura.services.media.add(entry))
		.add(kaltura.services.media.addContent('{2:result:id}', contentResource))
		.add(kaltura.services.uploadToken.upload('{1:result:id}', filepath));

    	if(source.options && source.options.partnerId) {
    		multiRequest.data.partnerId = source.options.partnerId;
    	}

        let This = this;
        
    	multiRequest
		.execute(this.client, (success, results) => {
			if(results.message) { // general transport error
				This.emit('error', results.message);
				return;
			}

			let hasErrors = false;
			for(var i = 0; i < results.length; i++){
				if(results[i] && typeof(results[i]) == 'object' && results[i].code && results[i].message) { // request error
					This.emit('error', results[i].message);
					hasErrors = true;
				}
			}
			if(!hasErrors) {
				This.emit('entry-created', results[1]);
			}
		});
    }
}

module.exports = Kaltura;