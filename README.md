veritech.js
==============
Super simple MVC using director and handlebars, less than 200 lines.

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

Controllers
-----------
Controllers are just arbitrary bits of js which handle rendering for a page, sitting in the Controllers directory.

you have a bunch of utility functions exposed:

    render(templateName, data, callback)
    
renders a template
    
    write(text)
    
writes text to the buffer

    done()
    
and it passes through request, response and arguments.

Templates
---------
These are pure [handlebars templates](http://handlebarsjs.com/) with the naming convention of [name].handlebars.tpl and sitting in the Templates directory.

If you had a template 'product/details' it would exist at 'Templates/product/details.handlebars.tpl'

Testing
-----
The Mocha is still brewing

Enjoy,

-Abbey Hawk Sparrow