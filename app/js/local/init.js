'use strict';

/**
  Init - Basic initialisation JS - Observer Pattern
  @author David Rugendyke
  @email david@mail.rocketpool.net
  @version 0.1
*/


/**
* @desc initialise the app
*/
;rocketPool.Init = (function ($) {

    // Basic module settings
    var name = 'Init';
    // Module event prefix with namespacing
    var eventNS = rocketPool.ns + '/' + name;
    // Defaults
    var settings = {
        network: {},
        currentAccount: false
    };

	/**
    * @desc module Constructor
    * @param object options - settings for the module
    * @return bool - success or failure
    */
    var init = function (options) {
        // Initialise options
        settings = $.extend(true, {}, settings, options);
        // Update the network we're connected too
        _updateNetwork();
        // Subscribe to certain observer accouncements
        _subscribers();
        // Set the module event publishers
        _publishers();
        // Internal event listeners
        _listeners();
        // Launch the background rocket
        $('#rocket').addClass('launched');
        // Add countdown clocks
        _countdownClocks();
        // Little loading screen while we hookup web3        
        setTimeout(function () { 
            // Show the processing screen with message
            $.observer.publish('rocketPool/Processing/hide');
        }, 2000);
    };

    /**
    * @desc start any countdown clocks for token sales
    */
    var _countdownClocks = function () {
        // Grab the current date
        var currentDate = new Date();
        
        // Get any clock instances
        $.each($('.countdown'), function (indexInArray, valueOfElement) {
            // Set some date in the future. In this case, it's always Jan 1
            var futureDate  = new Date($(this).data('date'));
            // Calculate the difference in seconds between the future and current date
            var diff = futureDate.getTime() / 1000 - currentDate.getTime() / 1000;
            // Add the clock
            $(this).FlipClock(diff, {
					clockFace: 'DailyCounter',
					countdown: true,
					showSeconds: false
            });
        });
    }

    /**
    * @desc update the status of the network
    */
    var _updateNetwork = function () {
        // Checking if Web3 has been injected by the browser (Mist/MetaMask)
        if (typeof web3 !== 'undefined') {
            // Use Mist/MetaMask's provider
            window.web3 = new Web3(web3.currentProvider);
        } else {
            // fallback - (local node)
            window.web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
        }
        // Detect network type  
        web3.version.getNetwork((err, netId) => {
            switch (netId) {
                case "1":
                    settings.network = { id: 'mainnet', label: 'mainnet' };
                    break
                case "2":
                    settings.network = { id: 'morden', label: 'morden test network' };
                    break
                case "3":
                    settings.network = { id: 'ropsten', label: 'ropsten test network' };
                    break
                default:
                    settings.network = netId ? { id: 'unknown', label: 'unknown/local network. ID - ' + netId } : false;
            }
            // Now update any labels when the callback completes
            $('.network-label').text(settings.network.label);
            // Publish the event
            $.observer.publish(eventNS + '/networkDetected', settings.network);        
            // Log it too
            console.log('Connected to: ' + settings.network.label);
        }); 
    };
    
    /**
    * @desc sets an Ethereum accounts details
    */
    var _setAccountDetails = function (accountEl) {
        // Get the address
        var address = accountEl.data('account-address');
        if (address) {
            // Generate account icons and labels      
            $.each($(accountEl).find('.account-icon'), function (indexInArray, valueOfElement) { 
                // Blockies
                $(this).css('background-image', 'url(' + blockies.create({ seed: address, size: 8, scale: 16 }).toDataURL() + ')');
            }); 
            // Labels
            $.each($(accountEl).find('.account-label'), function (indexInArray, valueOfElement) {
                var label = address;
                // Is it a short label
                if ($(this).hasClass('short')) {
                    var length = 26;
                    label = label.substring(0, length/2) + '...' + label.substring(label.length - length/2, label.length);
                }
                // Set it now
                $(accountEl).find('.account-label').text(label);
            });
            // Update the account totals
            window.web3.eth.getBalance(address, function (error, result) {
                if (!error) {
                    $(accountEl).find('.account-total').text(window.web3.fromWei(result, 'ether'));
                }
            });
        }  
    }

    /**
    * @desc sets an Ethereum account to use
    */
    var _setAccount = function (account) {    
        // If there's no current account, use the default coinbase
        if (!settings.currentAccount && settings.network) {
            settings.currentAccount = window.web3.eth.accounts[0];
        } else {           
            if (account) {
                settings.currentAccount = account;
            } 
        }
        // No unlocked accounts?
        if (!account || window.web3.eth.accounts.length == 0) {
            // Not using mist browser, metamask or localrpc
            $('#network.account').text('login with an ethereum browser or metamask to view accounts').addClass('error');
        }
        // Show it
        $('#network.account').addClass('loaded');
        // Update the address
        $('#network.account').data('account-address', settings.currentAccount);
        // Update the details npw
        _setAccountDetails($('#network.account'));
    }


     /**
    * @desc sets an Ethereum account list to select from
    */
    var _setAccountList = function () {
        // Get our account html template
        var template = $('#network.account').html();
        // Empty the list
        var list = $('#account-select .accounts').first();
        list.empty();
        // Build the list now        
        $.each(window.web3.eth.accounts, function (index, account) { 
            // Add it to the list
            var item = $('<div class="account" data-account-address="'+account+'">' + template + '</div>');
            // Update it now
            _setAccountDetails(item);
            // Append it
            list.append(item); 
        });
    }


    /**
 	* @desc Send an enquiry to Rocket Pool
 	*/
	var _contactSend =  function(button) {
		
		var form = $('.section.contact form').first();
        var content = form.find('textarea').val();
        
		if(content.length > 1) {
			// Show the processing screen with message
			$.observer.publish('rocketPool/Processing/show', 'sending to Rocket Pool...');
    		// Send the message now
			$.post('/send-contact.php', form.serialize(),
				// Success
				function(resp) {
					// Build the options for the new box
					if(resp.success) {
						// Show success message
						form.hide();
                        $('.section.contact .thanks').show();
					}else{
						// Show the error
						alert('Oops an error has occured - '+resp.error);
					}
				})
				.done(function() {
				})
				.fail(function() {
				})
				.always(function() {
					setTimeout(function(){
						$.observer.publish('rocketPool/Processing/hide');
					}, 1000);
				});
		}
	}


	/**
    * @desc subsribe to dom wide observer aanouncments
    * @example $.observer.subscribe(eventNS+'/function', _function);	
    */
    var _subscribers = function () {

        // When the network changes
        $.observer.subscribe(eventNS + '/networkDetected', _setAccount);
        $.observer.subscribe(eventNS + '/networkDetected', _setAccountList);
        // When a new account is selected
        $.observer.subscribe(eventNS + '/accountChanged', _setAccount);

    };

    /**
    * @desc publish dom wide observer aanouncments
    * @example $.observer.publish(eventNS+'/function', parameterOne, ParameterTwo, etc);		
    */
    var _publishers = function () {

        // Publish which network we're initially connected too
        $.observer.publish(eventNS + '/network/change', settings.network);
        
         // Account select
        $('#account-select').on('click', '.account', function () {
            $('#account-select').removeClass('open');
            $.observer.publish(eventNS+'/accountChanged', $(this).data('account-address'));
        });

        // Initialise page piling, there's a lot more options for these    
        if ($(window).height() >= 1050) {
            $('#app').pagepiling({
                direction: 'vertical',
                verticalCentered: true,
                scrollingSpeed: 700,
                easing: 'swing',
                sectionSelector: '.section',
                animateAnchor: false,
                loopBottom: true,
                normalScrollElementTouchThreshold: 4,
                //events
                onLeave: function (index, nextIndex, direction) {
                    $.observer.publish(eventNS+'/pageLeave', index, nextIndex, direction);
                },
                afterLoad: function (anchorLink, index) { 
                    $.observer.publish(eventNS+'/pageLoaded', anchorLink, index);
                },
                afterRender: function () { 
                    $.observer.publish(eventNS+'/pageRendered');
                },
            });
        }

    };

    
	/**
    * @desc internal event listers that don't require interacting with anything outside this module
    */
    var _listeners = function ()
    {
        // Show sub menu on the main menu
        $('.main-menu .top > div > i').on('click', function () { 
            $(".main-menu .sub .menu").hide();
            $(this).parent().siblings().removeClass('on');
            $(this).parent().addClass('on');
            $(".main-menu .sub div.menu[data-id='" + $(this).data('menu') + "']").css('display', 'flex');
        }); 

        // Sub menu on state
        $('.main-menu .sub .menu > div').on('click', function () { 
            $(this).siblings().removeClass('on');
            $(this).addClass('on');
        }); 

        // Move to new pages
        $(document).on('click', '.page-link', function() {
            if ($(this).data('page-id')) {
                if ($.fn.pagepiling.moveTo) {
                    $.fn.pagepiling.moveTo($(this).data('page-id'));
                } else {
                    $(window).scrollTo($('div[data-anchor=' + $(this).data('page-id') + ']'), 1000);
                }
                
            }
        });

        // Contact form
        $('.section.contact form button').on('click', function() {
            _contactSend($(this));
        });

        // Show account lists
        $('#network.account').on('click', function () {
            if (!$(this).hasClass('error')) {
                $('#account-select').addClass('open');
            }  
        });


        /*** TEST METHODS */
        // Show the processing screen with message
        $.observer.publish('rocketPool/Processing/show', 'looking for ethereum blockchain...');
        /*** END TEST */

    };


    return {
        init: init
    };

})(jQuery);


// Initalise the module and bind its element + options to it
jQuery(document).ready(jQuery.proxy(rocketPool.Init.init, rocketPool.Init));