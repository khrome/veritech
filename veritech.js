#!/usr/bin/env node

var ManifestBuilder = require('requirejs-manifest-builder');
var builder = new ManifestBuilder();
//ultra minimal node MVC
var config = require('commander');
//var art = require('ascii-art');
var arrays = require('async-arrays');
var fs = require('fs');
//var director = require('director');
var vm = require('vm');
var qs = require('querystring');
var url = require('url');
//var Handlebars = require('handlebars');
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
var lastError;

function ApplicationError(msg, type){
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.message = msg;
  this.code = type || 500;
  this.name = 'ApplicationError';
  lastError = this;
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
        if(options.autodeps){
            manifestOptions['dependencies'] = pkg.dependencies?Object.keys(pkg.dependencies):[];
            if(pkg.subdependencies) manifestOptions['dependencies'] = manifestOptions['dependencies'].concat(pkg.subdependencies);
        }
        if(options.modulesPath) builder.modulesPath(options.modulesPath);
        builder.buildManifest(manifestOptions, function(err, manifest, modules){
            callback(err, manifest, modules);
        });
    }
}

var errorFunction = function(options, request, response){
    //console.log(lastError);
    //console.log('**********');
    fs.exists(options.code+'.html', function(errorPageExists){
        var hardCodedError = function(){
            console.log(options+'');
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

var cache = {};
function requirePlus(cb){
    if(cache && cache.requirePlus) cb(undefined, cache.requirePlus);
    fs.readFile(__dirname+'/node_modules/requirejs-manifest-builder/requireplus.js', function(rplusErr, requireMod){
        if(cache) cache.requirePlus = requireMod;
        cb(undefined, cache.requirePlus);
    });
}

function requireInitScript(cb){
    if(cache && cache.init) cb(undefined, cache.init);
    fs.readFile(process.cwd()+'/client.js', function(rplusErr, requireMod){
        if(requireMod.toString) requireMod = requireMod.toString()
        if(cache) cache.init = requireMod;
        cb(undefined, cache.init);
    });
}

function buildPage(opts, buffer){
    var html = buffer.toString();
    html = html.replace('<!--[SOCKET]-->', opts.socket || '');
    html = html.replace('<!--[LOADER]-->', opts.loader || '');
    html = html.replace('<!--[EXTENSION]-->', opts.extension || '');
    html = html.replace('<!--[POLYMER]-->', opts.polymer || '');
    html = html.replace('<!--[INIT]-->', opts.initialize || '');
    html = html.replace('<!--[INITIALIZE]-->', opts.initialize || '');
    return html;
}

function rootHarness(request, response, filter){
    getRequireConfig(function(err, config, output){
        if(typeof config != 'string') config = JSON.stringify(config, null, '\t');
        requireInitScript(function (err, init){
            requirePlus(function(rplusErr, requireMod){
                if(err || rplusErr){
                    response.writeHead(404);
                    return response.end((err || rplusErr).message);
                }
                var opts = {};
                opts.socket = (a.socketHandler?'<script src="/socket.io/socket.io.js"></script>\n':'');
                opts.loader = '<script src="/require.js"></script>\n<script>\n'+
                        'require.config('+config+');'+
                    '</script>';
                opts.extension = (options.extensions?('<script>\n'+
                        requireMod+
                    '\n</script>'):'');
                opts.initialize = '<script>\n'+
                        (init || '').toString()+
                    '\n</script>';
                opts.polymer = output.polymer?'<script src="/polymer/platform.js"></script><link rel="import" href="/polymer/polymer.html" />':'';
                if(options.index){
                    fs.readFile(process.cwd()+'/'+options.index, function(err, body){
                        if(err){
                            response.writeHead(404);
                            return response.end(err.message, options);
                        }
                        var page = buildPage(opts, body);
                        if(filter) page = filter(page);
                        response.end(page);
                    });
                }else{
                    var page = 
                        '<html lang="US-en"><head>\n'+
                        '<meta charset="utf-8">\n'+
                        '<!--[SOCKET]-->'+
                        '<!--[LOADER]-->'+
                        '<!--[EXTENSION]-->'+
                        '<!--[POLYMER]-->'+
                        '<!--[INIT]-->'+
                        '</head><body>\n'+
                            '<!--THE BODY HAS NOT BEEN REPLACED!-->'+
                        '\n</body></html>'
                    ;
                    page = buildPage(opts, page);
                    if(filter) page = filter(page);
                    response.end(page);
                }
            });
        });
    });
}

function launch(routes){
    //if(routes) a.router = new director.http.Router(routes);
    if(routes) a.router = makeRouter(routes);

    function log(type, message, level){
        if(config.verbose && (level || 1) <= (config.log_level || 1)) console.log('log', message);
    }

    var router;
    var templates = {};
    var controllers = {};
    var Handlebars;

    function render(templateName, data, callback){
        if(templates[templateName]){
            callback(templates[templateName](data));
        }else{
            fs.readFile(process.cwd()+'/'+module.exports.templateDirectory+'/'+templateName+'.handlebars.tpl', function(error, file){
                if(error) console.log(error);
                else{
                    if(!Handlebars) Handlebars = require('handlebars');
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
        var error = function(type, message, request, response, error){
            var options = {};
            var stack = (new Error()).stack.split("\n");
            stack.shift();
            options.stack = (error.stack?error.stack.split("\n").concat(stack):stack).join("\n");
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
            options.toString = function(){
                return 'Error: '+options.code+"\n"+
                //options.message+"\n"+ //already on the stack
                options.stack;
            }
            errorFunction(options, request, response);
        };
        var handler = function(request, response) {
            var requestDomain = domain.create();
            requestDomain.add(request);
            requestDomain.add(response);
            requestDomain.on('error', function(err){
                try{
                    error(err.code || 500, err.message, request, response, err);
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
                    a.router.route(request, response, function (err){
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
                                builder.realPath(path, function(path){ //handle use of alternative module roots
                                    fs.exists(path, function(exists){
                                        fs.readFile(path, function (err, buffer){
                                            if(err){
                                                module.exports.error(err.message);
                                                return error('404', 'The requested resource does not exist.', response);
                                            }
                                            var type = mime.lookup(process.cwd()+path);
                                            response.setHeader("Content-Type", type);
                                            response.end(buffer);
                                        });
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

var makeRouter = function(routes){
    throw new Error('no router selected');
}

process.on('uncaughtException', function(){
    conole.log('?', arguments);
});

var makeDirectorRouter = function(routes){
    var director = require('director');
    var router = new director.http.Router(routes);
    var shim = {};
    shim.route = function(req, res, fallthruFn){
        return router.dispatch.apply(router, arguments);
    }
    shim.add = function(method, route, handler){
        if(method == '*') method = ['get', 'post', 'put', 'delete'];
        if(Array.isArray(method)){
            method.forEach(function(method){
                shim.add(method, route, handler);
            });
        }else{
            router[method](route, handler);
        }
    }
    return shim;
}

var makeProtolusRouter = function(routes){
    throw new Error('Protolus routing not yet supported')
    /*var ProtolusRouter = require('protolus-router');
    var router = new ProtolusRouter(routes);
    var shim = {};
    shim.route = function(req, res, fallthruFn){
        
        return router.dispatch.apply(router, arguments);
    }
    shim.add = function(method, route, handler){
        if(method == '*'){
            router.addRoute(route, handler);
        }else{
            var context = (Array.isArray(method)?method:[method])
            router.addRoute(route, context, handler);
        }
    }
    return shim;*/
}

// SUPPORT FOR CLI TOOLS (frameworks/transports)

var supported = {
    transports : {},
    frameworks : {}
};

function subClass(fn, newClass){
    if(typeof newClass != 'function'){ //handle passed in objects
        var cons = newClass.constructor || newClass.initialize;
        if(newClass.constructor){
            delete newClass.constructor; 
        }else if(newClass.initialize) delete newClass.initialize;
        cons.prototype = newClass;
    }
    var constructor = newClass;
    var superClass = fn;
    var proto = clone(fn.prototype);
    var cls = function(){
        superClass.apply(this, arguments);
        constructor.apply(this, arguments);
    }
    Object.keys(newClass.prototype).forEach(function(field){
        proto[field] = newClass.prototype.field;
    });
    cls.prototype = proto;
    cls.prototype.constructor = constructor;
    return cls;
}

function GenericTransport(){
    this.options = options || {};
    //todo: handle environment vars
    if(!this.options.path) this.options.path = 'veritech_modules/';
}
GenericFramework.prototype.fetch = function(name, cb){
    fs.readFile(this.options.path+name, function(err, data){
        if(err) return cb(err);
        
    })
}

function GenericFramework(){
    
}
GenericFramework.prototype.install = function(name, cb){
    //default is to fetch a repo from git to this.directory
    supported.transports.git.fetch(name, cb);
}
GenericFramework.prototype.remove = function(name, cb){
    //default is folder delete this.directory+name
    fs.exists(this.directory+name, function(exists){
        if(!exists) cb(new Error('The directory '+this.directory+name+' does not exist!'));
        else{
            fs.unlink(this.directory+name, cb);
        }
    });
}
GenericFramework.prototype.update = function(name, cb){
    this.remove(function(err){
        if(err) cb(err);
        else this.install(cb);
    });
}
GenericFramework.prototype.version = function(){
    return '0.0-prealpha'
}
GenericFramework.prototype.man = function(){
    return "Encourage the maintainer of this transport to add a readme"
}

function registerFramework(name, ob){
    supported.frameworks[name] = subClass(ob, GenericFramework);
}
function registerTransport(name, ob){
    supported.transports[name] = subClass(ob, GenericFramework);
}

module.exports = {
    launch : function(routes, socketHandler){
        if(socketHandler) a.socketHandler = socketHandler;
        launch(routes);
    },
    DefaultFramework : GenericFramework,
    DefaultTransport : GenericTransport,
    registerFramework : registerFramework,
    registerTransport : registerTransport,
    framework : function(name){
        return supported.frameworks[name];
    },
    transport : function(name){
        return supported.transports[name];
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
    router : function(handler){
        if(typeof handler == 'string'){
            switch(handler.toLowerCase()){
                case 'director':
                    makeRouter = makeDirectorRouter;
                    break;
                default : throw new Error('unknown routing type: '+handler);
            }
        }else{
            if(typeof handler == 'function'){
                makeRouter = handler;
            }else throw new Error('unknown routing handler type: '+(typeof handler));
        }
        
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