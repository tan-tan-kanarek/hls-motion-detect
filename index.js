
/* jshint -W079 */

module.exports = {
	DetectServer: require('./lib/server.js'),
	Source: require('./lib/source.js'),
	ApiServer: require('./lib/plugins/api-server.js'),
	WebServer: require('./lib/plugins/web-server.js'),
	RabbitServer: require('./lib/plugins/rabbit-mq-server.js')
};
