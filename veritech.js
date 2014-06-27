#!/usr/bin/env node

var ManifestBuilder = require('requirejs-manifest-builder');
var builder = new ManifestBuilder();
//ultra minimal node MVC
var config = require('commander');
var art = require('ascii-art');
var arrays = require('async-arrays');
var fs = require('fs');
var director = require('director');
var vm = require('vm');
var qs = require('querystring');
var url = require('url');
var Handlebars = require('handlebars');
var mime = require('mime');
var domain = require('domain');
var Emitter = require('extended-emitter');
var pkg = require(process.cwd()+'/package');

config.version(pkg.version);
config.option('-p, --port [number]', 'The port to listen on', '80', parseInt);
config.option('-d, --develoment', 'Put the app into development mode');
config.option('-D, --demo', 'Put the app into demo mode(generated data)');
config.option('-x, --ssl_pfx [pfx]', 'PKCS#12 archive');
config.option('-P, --ssl_port [number]', 'port for ssl connections');
config.option('-K, --ssl_key [key]', 'SSL key file');
config.option('-C, --ssl_certificate [certificate]', 'SSL certificate file');
config.option('-c, --config [file]', 'Load a set of app configurations from a JSON file');
config.option('-s, --socket', 'Enable Web Sockets');
config.option('-s, --socket_port', 'Set Websocket Port');
//config.option('-m, --minify', 'Minify js and css resources');
//config.option('-f, --log_file', 'The file to write logging data to');
//config.option('-r, --log_rotation [strategy]', 'The strategy');
config.option('-l, --log_level', 'The granularity of logging [1-5] where 1 is the most general', '1', parseInt);
config.option('-v, --verbose', 'Enable verbose output at the the present log level');
config.parse(process.argv);
config.name = pkg.name;

var options = {};

function ApplicationError(msg, type){
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.message = msg;
  this.code = type || 500;
  this.name = 'ApplicationError';
};
ApplicationError.prototype.__proto__ = Error.prototype;

var emitter = new Emitter();
var logger = function(message, level){
    level = level || module.exports.log_level; 
    emitter.emit('log', message, level);
};

function getRequireConfig(callback){
    if(fs.exists(process.cwd()+'/require-config.json')){
        //todo: handle cache
    }else{
        var manifestOptions = {};
        // constructor postprocess (pick up extensions and autogen process functions)
        if(options.extensions) manifestOptions['process'] = true;
        builder.buildManifest(manifestOptions, function(err, manifest, modules){
            callback(err, manifest, modules);
        });
    }
}

var errorFunction = function(options, request, response){
    fs.exists(options.code+'.html', function(errorPageExists){
        var hardCodedError = function(){
            response.end(
                '<html><head><title>'+options.code+' Error!</title></head><body><h1>'+
                options.code+'</h1><h2>'+options.message+'</h2></body></html>'
            );
        };
        if(errorPageExists){
            fs.readFile(process.cwd()+'/'+options.code+'.html', function (err, data) {
                if(err) hardCodedError();
                else response.end(data);
            });
        }else hardCodedError();
    });
};

var a = {}; // just an anchor for shared referencing

function rootHarness(request, response, filter){
    getRequireConfig(function(err, config){
        if(typeof config != 'string') config = JSON.stringify(config, null, '\t');
        fs.readFile(process.cwd()+'/client.js', function (err, init) {
            fs.readFile(__dirname+'/node_modules/requirejs-manifest-builder/requireplus.js', function(rplusErr, requireMod){
                var body = 
                    '<html lang="'+module.exports.language+'-'+module.exports.region+'"><head>\n'+
                    '<meta charset="utf-8">\n'+
                    (a.socketHandler?'<script src="/socket.io/socket.io.js"></script>\n':'')+
                    '<script src="/require.js"></script>\n<script>\n'+
                        'require.config('+config+');'+
                    '</script>'+(options.extensions?('<script>\n'+
                        requireMod+
                    '\n</script>'):'')+
                    '<script>\n'+
                        (init || '').toString()+
                    '\n</script></head><body>\n'+
                        '<!--THE BODY HAS NOT BEEN REPLACED!-->'+
                    '\n</body></html>'
                ;
                if(filter) body = filter(body);
                response.end(body);
            });
        });
    });
}

function launch(routes){
    if(routes) a.router = new director.http.Router(routes);

    function log(type, message, level){
        if(config.verbose && (level || 1) <= (config.log_level || 1)) console.log('log', message);
    }

    var router;
    var templates = {};
    var controllers = {};

    function render(templateName, data, callback){
        if(templates[templateName]){
            callback(templates[templateName](data));
        }else{
            fs.readFile(process.cwd()+'/'+module.exports.templateDirectory+'/'+templateName+'.handlebars.tpl', function(error, file){
                if(error) console.log(error);
                else{
                    templates[templateName] = Handlebars.compile(''+file);
                    render(templateName, data, callback);
                }
            });
        }
    }

    function controller(name, args, request, response, done){
        if(controllers[name]){
            var page = '';
            vm.runInNewContext(controllers[name], {
                write : function(text){
                    page += text;
                },
                done : function(){
                    //todo: handle request close
                    response.end(page);
                    if(done) done();
                },
                render : render,
                args : args,
                cookie : {},
                request : request,
                response : response
            });
        }else{
            fs.readFile(process.cwd()+'/'+module.exports.controllerDirectory+'/'+name+'.js', function(error, file){
                if(error) console.log(error);
                else{
                    controllers[name] = file;
                    controller(name, args, request, response, done);
                }
            });
        }
    }
    a.controller = controller;
    
    var serve = function(){
        var error = function(type, message, request, response){
            var options = {};
            var stack = (new Error()).stack.split("\n");
            stack.shift();
            options.stack = stack;
            if(typeof type === 'number') options.code = type;
            else{
                if(type && [
                    '100', '101', '102', 
                    '200', '201', '202', '203', '204', '205', '206', '207', '208',
                    '300', '301', '302', '303', '304', '305', '306', '307', '308', 
                    '400', '401', '402', '403', '404', '405', '406', '407', '408', '409', '410',
                        '411', '412', '413', '414', '415', '416', '417', '418', '419', '420', '422',
                        '423', '424', '425', '426', '428', '429', '431', '440', '444', '449', '450', 
                        '451', '494', '495', '496', '497', '499',
                    '500', '501', '502', '503', '504', '505', '506', '507', '508', '509', '510', 
                        '511', '520', '521', '522', '523', '524', '598', '599'
                ].indexOf(type) !== -1) options.code = parseInt(type);
                else options.code = 404;
            }
            options.message = message;
            errorFunction(options, request, response);
        };
        var handler = function(request, response) {
            var requestDomain = domain.create();
            requestDomain.add(request);
            requestDomain.add(response);
            requestDomain.on('error', function(err){
                try{
                    error(err.code || 500, err.message, request, response);
                }catch(err){
                    console.error('Error generating error '+err.message);
                }
            });
            try{
                request.get = qs.parse(request.url);
                request.setEncoding("utf8");
                request.content = '';
                var random = 1 + Math.floor(Math.random()*1000000);
                request.addListener("data", function(chunk) {
                    request.content += chunk;
                });
                request.addListener("end", function(){
                    try{
                        request.post = qs.parse(request.content); //first try normal args
                    }catch(ex){
                        try{
                            request.post = JSON.stringify(request.content); //if not give JSON a chance
                        }catch(ex){}
                    }
                    var caselessPath = request.parsedURL.path.toLowerCase();
                    if(caselessPath == '/' || caselessPath == 'index'|| caselessPath == 'index.html'|| caselessPath == 'index.sky'){
                        return rootHarness(request, response);
                    }
                    a.router.dispatch(request, response, function (err){
                        var uri = url.parse(request.url, true);
                        var path = ((type == '!' && uri.pathname != '/')?uri.pathname+'.html':uri.pathname);
                        var type = path.lastIndexOf('.') != -1 ? path.substring(path.lastIndexOf('.')+1) : '!';
                        if(!type) return error('404', 'The requested resource does not exist.', request, response);
                        switch(type.toLowerCase()){
                            case 'png':
                            case 'gif':
                            case 'jpg':
                            case 'jpeg':
                            case 'json':
                            case 'js':
                            case 'html':
                            case 'css':
                            case 'ttf':
                            case 'eot':
                            case 'woff':
                            case 'ico':
                            case 'otf':
                            case 'svg':
                            case 'handlebars': 
                                fs.exists(process.cwd()+path, function(exists){
                                    fs.readFile(process.cwd()+path, function (err, buffer){
                                        if(err){
                                            module.exports.error(err.message);
                                            return error('404', 'The requested resource does not exist.', response);
                                        }
                                        var type = mime.lookup(path);
                                        response.setHeader("Content-Type", type);
                                        response.end(buffer.toString());
                                    });
                                });
                                break;
                            default: return error('404', 'The requested resource does not exist.', request, response);
                        }
                    });
            
                });
                request.parsedURL = url.parse(request.url, true);
                request.get = request.parsedURL.query
            }catch(ex){
                console.log(ex);
                return error('error', 'The requested resource does not exist.', request, response);
            }
        };
        serverDomain.run(function(){
            try{
                var server = require('http').createServer(handler).listen(config.port);
                emitter.emit('http-server-started', server);
                if(a.socketHandler){
                    emitter.emit('socket-server-started', server);
                    var io = require('socket.io').listen(server, { log: false });
                    io.sockets.on('connection', function(socket){
                        if(a.socketHandler) a.socketHandler.apply(this, arguments);
                    });
                }
            }catch(ex){
                module.exports.error('Could not start webservice');
            }
            server.on("listening", function(){
                emitter.emit('http-server-listening', server);
                console.log('Listening on port '+config.port)
            });
            if( config.ssl_pfx || config.ssl_key && config.ssl_certificate ){
                emitter.emit('https-server-started', server);
                require('https').createServer(config.ssl_port);
            }
        });
    };

    if(config.config){
        fs.readFile(config.config, function(error, text){
            var data = JSON.parse(text);
            Object.keys(data).forEach(function(key){
                if(!config[key]) config[key] = data[key];
            });
            serve();
        });
    }else{
        serve();
    }
}
var serverDomain = domain.create(); //create a domain context for the server

module.exports = {
    launch : function(routes, socketHandler){
        if(socketHandler) a.socketHandler = socketHandler;
        launch(routes);
    },
    templateDirectory : 'Templates',
    controllerDirectory : 'Controllers',
    language : 'en',
    region : 'US',
    controller : function(){
        a.controller.apply(this, arguments);
    },
    required : function(callback){
        return getRequireConfig(callback);
    },
    log : function(message, level){
        //todo: convert to a 2 way map
        if(typeof level == 'string'){
            switch(level.toLowerCase()){
                case 'error':
                    level = module.exports.log.level.ERROR;
                    break;
                case 'debug':
                    level = module.exports.log.level.DEBUG;
                    break;
                case 'fatal':
                    level = module.exports.log.level.FATAL;
                    break;
                case 'information':
                    level = module.exports.log.level.INFORMATION;
                    break;
                case 'warning':
                    level = module.exports.log.level.WARNING;
                    break;
            }
        }
        if(typeof message == 'function'){
            logger = message;
        }else{
            if(!level) level = module.exports.log.level.INFO;
            if(module.exports.log_level & level){
                logger(message);
            }
        }
    },
    errorHandler : function(fn){
        errorFunction = fn;
    },
    option : function(name, value){
        if(name) options[name] = value;
    },
    error : function(message, type){
        throw new ApplicationError(message, type);
    },
    on : function(){ return emitter.on.apply(emitter, arguments); },
    once : function(){ return emitter.once.apply(emitter, arguments); },
    off : function(){ return emitter.off.apply(emitter, arguments); },
    emit : function(){ return emitter.emit.apply(emitter, arguments); },
    harness : rootHarness,
    config : config
}
var aBit = 1;
module.exports.log.level = {};
module.exports.log.level.FATAL = aBit;
module.exports.log.level.ERROR = aBit << 1;
module.exports.log.level.WARNING = aBit << 2;
module.exports.log.level.WARN = module.exports.log.level.WARNING;
module.exports.log.level.INFORMATION = aBit << 3;
module.exports.log.level.INFO = module.exports.log.level.INFORMATION;
module.exports.log.level.DEBUG = aBit << 4;
module.exports.log.level.TRACE = aBit << 5;
module.exports.log_level = module.exports.log.level.FATAL | module.exports.log.level.ERROR;