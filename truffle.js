/**
  Rocket Pool
  @author David Rugendyke
  @email david@mail.rocketpool.net
  @version 0.1 
*/

var DefaultBuilder = require("truffle-default-builder");

module.exports = {
    build: new DefaultBuilder({
        "index.html": "index.html",
        "app.js": [
            // Vendor  
            "js/vendor/jquery-3.2.1.js",
            "js/vendor/jquery.observer.js",
            "js/vendor/jquery.pagepiling.min.js",
            "js/vendor/jquery.scrollTo.min.js",
            "js/vendor/blockies.min.js",
            // Local
            "js/local/config.js",
            "js/local/processing.js",
            "js/local/init.js"
        ],
        "app.css": [
            // Local
            "css/local/init.css",
            "css/local/contact.css",
            "css/local/overlay-processing.css",
            "css/local/responsive.css",
            // Fonts
            "css/fonts/fonts.css",
            "css/fonts/fontawesome/font-awesome.min.css",
            // Vendor
            "css/vendor/jquery.pagepiling.css",    
        ],
        "files/": "files/",
        "images/": "images/",
        "fonts/": "css/fonts/",
        "config/": "config/",
        "/": "favicon.ico",
        "/": "contact/send-contact.php"
    }),
    networks: {
        development: {
        host: "localhost",
        port: 8545,
        network_id: "*", // Match any network id
        //gas: 5500000
        }
    }
};
