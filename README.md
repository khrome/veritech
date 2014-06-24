veritech.js
==============
Super simple MVC using director and handlebars, less than 400 lines. Serves frontend JS from NPM.

Usage
-----
first, install:

    npm install veritech
    
then require:

    var server = require('veritech');
    
when you launch your server, you provide a set of routes to the system through the [director route syntax](https://npmjs.org/package/director), plus you can execute any controller in the system with a call to 

    server.controller(name, arguments, request, response);
    
which will execute a controller for the page, or you can just manually handle that route

Command Line Options
--------------------
From the interactive output:

    -h, --help                           output usage information
    -V, --version                        output the version number
    -p, --port [number]                  The port to listen on
    -x, --ssl_pfx [pfx]                  PKCS#12 archive
    -P, --ssl_port [number]              port for ssl connections
    -K, --ssl_key [key]                  SSL key file
    -C, --ssl_certificate [certificate]  SSL certificate file
    -c, --config [file]                  Load a set of configurations from a JSON file
    -l, --log_level                      The granularity of logging [1-5] where 1 is the most general
    -v, --verbose                        Enable verbose output at the the present log level
    
just pass these in as you execute your script and they'll get picked up

In the Browser
--------------
Veritech drops an index and autoscans the root node_modules directory and enables them for load using [requirejs-manifest-builder](https://www.npmjs.org/package/requirejs-manifest-builder). This allows you to build [UMD](https://github.com/umdjs/umd/blob/master/returnExports.js) modules that run in both Node(even if only for testing) and the browser without an onerous build process.

`client.js` will then be shipped to the client and an application init and you use [require.js](http://requirejs.org/) to pull in your assets.

Single Page Apps
----------------

You're already using director, so go ahead and load it in the browser and go to town. Load your favorite MVC, whatever. How easy is that, right?

I like to use [live-templates](https://www.npmjs.org/package/live-templates) in combination with [array-events](https://www.npmjs.org/package/array-events) and [object-events](https://www.npmjs.org/package/object-events) but you may want to use something like [Backbone](http://backbonejs.org/) or some other library (which if you use and I haven't listed it here, you will dutifully report back the results).

Multipage Apps
--------------
Controllers are just arbitrary bits of js which handle rendering for a page, sitting in the Controllers directory.

you have a bunch of utility functions exposed:

    render(templateName, data, callback)
    
renders a template
    
    write(text)
    
writes text to the buffer

    done()
    
and it passes through request, response and arguments.

Templates are pure [handlebars templates](http://handlebarsjs.com/) with the naming convention of [name].handlebars.tpl and sitting in the Templates directory.

If you had a template 'product/details' it would exist at 'Templates/product/details.handlebars.tpl'


Testing
-----
The Mocha is still brewing

Enjoy,

-Abbey Hawk Sparrow