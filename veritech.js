#!/usr/bin/env node
//ultra minimal node MVC
var config = require('commander');
var art = require('ascii-art');
var fs = require('fs');
var director = require('director');
var vm = require('vm');
var url = require('url');
var Handlebars = require('handlebars');
var mime = require('mime');
var a = {}; // just an anchor for shared referencing
function launch(){
    //todo: profile networks
    config.version(require('./package').version);
    config.option('-p, --port [number]', 'The port to listen on', '80', parseInt);
    config.option('-x, --ssl_pfx [pfx]', 'PKCS#12 archive');
    config.option('-P, --ssl_port [number]', 'port for ssl connections');
    config.option('-K, --ssl_key [key]', 'SSL key file');
    config.option('-C, --ssl_certificate [certificate]', 'SSL certificate file');
    config.option('-c, --config [file]', 'Load a set of configurations from a JSON file');
    //config.option('-s, --socket', 'Enable Web Sockets');
    //config.option('-m, --minify', 'Minify js and css resources');
    //config.option('-r, --resources', 'Enable Protolus resource bundling');
    //config.option('-f, --log_file', 'The file to write logging data to');
    //config.option('-r, --log_rotation [strategy]', 'The strategy');
    config.option('-l, --log_level', 'The granularity of logging [1-5] where 1 is the most general', '1', parseInt);
    config.option('-v, --verbose', 'Enable verbose output at the the present log level');
    config.parse(process.argv);

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
            fs.readFile(process.cwd()+'/Templates/'+templateName+'.handlebars.tpl', function(error, file){
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
            fs.readFile(process.cwd()+'/Controllers/'+name+'.js', function(error, file){
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
        var error = function(type, message, response){
            if(type == '404') response.writeHead(404);
            fs.exists(type+'.html', function(errorPageExists){
                var hardCodedError = function(){
                    response.end('<html><head><title>Error!</title></head><body><h1>'+type+'</h1><h2>'+message+'</h2></body></html>');
                }
                if(errorPageExists){
                    fs.readFile(process.cwd()+'/'+type+'.html', function (err, data) {
                        if(err) hardCodedError();
                        else response.end(data);
                    });
                }else hardCodedError();
            });
        };
        var handler = function(request, response) {
            try{
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
                    a.router.dispatch(request, response, function (err){
                        var uri = url.parse(request.url, true);
                        var path = ((type == '!' && uri.pathname != '/')?uri.pathname+'.html':uri.pathname);
                        var type = path.lastIndexOf('.') != -1 ? path.substring(path.lastIndexOf('.')+1) : '!';
                        console.log('PATH', path, type);
                        if(!type) return error('404', 'The requested resource does not exist.', response);
                        switch(type.toLowerCase()){
                            case 'png':
                            case 'gif':
                            case 'jpg':
                            case 'jpeg':
                            case 'js':
                            case 'html':
                            case 'css':
                            case 'ttf':
                            case 'otf':
                            case 'svg':
                                console.log('file', process.cwd()+path)
                                fs.exists(process.cwd()+path, function(exists){
                                    console.log('exists');
                                    fs.readFile(process.cwd()+path, function (err, data) {
                                        console.log('found', err);
                                        if (err) return error('404', 'The requested resource does not exist.', response);
                                        response.setHeader("Content-Type", mime.lookup(path));
                                        response.end(data);
                                    });
                                });
                                break;
                            default: return error('404', 'The requested resource does not exist.', response);
                        }
                    });
                
            
                });
                request.parsedURL = url.parse(request.url, true);
                request.get = request.parsedURL.query
            }catch(ex){
                console.log(ex);
                return error('error', 'The requested resource does not exist.', response);
            }
        };
        var server = require('http').createServer(handler).listen(config.port);
        server.on("listening", function(){
            //log ready
            console.log('Listening on port '+config.port)
        });
        if( config.ssl_pfx || config.ssl_key && config.ssl_certificate ) require('https').createServer(config.ssl_port);
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

module.exports = {
    launch : function(routes){
        launch();
        if(routes) a.router = new director.http.Router(routes);
    },
    controller : function(){
        a.controller.apply(this, arguments);
    }
}