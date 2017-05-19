/*!
  'Processing Overlay' - Modular Pattern
  - Dims the page while displaying a message, usually while processing or loading something
  @author David Rugendyke
  @version 1.0
*/

;rocketPool.Processing = (function($) {

	// Basic module settings
	var name = 'Processing';
	// Module event prefix with namespacing
	var eventNS = rocketPool.ns+'/'+name;
	// Defaults
	var settings =  {
		loader : null
	};


	/**
    * @desc module Constructor
    * @param object options - settings for the module
    * @return bool - success or failure
    */
	var init = function(options) {
		
		// Initialise navbar & options
		settings = $.extend(true, {}, settings, options);
		// Set the main container
		settings.loader = $('#loader-wrapper');
		// Subscribe to certain observer accouncements
		_subscribers();
		// Set the module event listeners
        _publishers();


	};
	
	/**
 	* Shows the processing screen
 	*/
	var _show =  function(text, addDots) {
     
		$('body').removeClass('loaded');
		_setText(text);
		// Are we adding animated dots?
		if(addDots) {
			_addDots();
		}
		settings.loader.show();
		
	}
	
	/**
 	* Change the text
 	*/
	var _setText =  function(text) {
		
		// This action can be subscribed too, so make sure we have the instance
		var loader = !settings.loader ? $('#loader-wrapper') : settings.loader;
		loader.find('.line').text(text.toLowerCase());
	}
	
	/**
 	* Hides the processing screen
 	*/
	var _hide =  function() {
		
		$('body').addClass('loaded');
		settings.loader.find('.line').text('');
	}
	
	/**
 	* Adds loading "dots" to the end of the text
 	*/
	var _addDots =  function() {
		
		var textLine = settings.loader.find('.line');
		var span = $('<span/>').appendTo(textLine);

		var dots = window.setInterval( function() {
			
		if (span.text().length >= 3) {
			span.text('');
		}else{
			var line = span.text();
			span.text(line += ".");
		}}, 500);

		
	}
	
		
	/**
    * @desc subsribe to dom wide observer aanouncments
    * @example $.observer.subscribe(eventNS+'/function', _function);	
    */
	var _subscribers =  function() {
		
		// Show the processing screen
		$.observer.subscribe(eventNS+'/show', _show);	
		
		// Hide the processing screen
		$.observer.subscribe(eventNS + '/hide', _hide);
		
		// Change the text on the screen
		$.observer.subscribe(eventNS+'/textUpdate', _setText);

	}

    
	/**
    * @desc publish dom wide observer aanouncments
    * @example $.observer.publish(eventNS+'/function', parameterOne, ParameterTwo, etc);		
    */
	var _publishers =  function() {
		
				
	};
	
	/**
	*  Make available our public methods
	*/
	return {
		init: init
	};

})(jQuery);


// Initalise the module and bind its element + options to it
jQuery(document).ready(jQuery.proxy(rocketPool.Processing.init, rocketPool.App));


