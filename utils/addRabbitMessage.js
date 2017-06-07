

var Tortoise = require('tortoise')
var tortoise = new Tortoise('amqp://localhost');

var message = {
    systemName : process.argv[2],
    sourceURL : process.argv[3]
};

tortoise
.queue('streams', {
    durable : true,
    autoDelete : true
})
.publish(message);