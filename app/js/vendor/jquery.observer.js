;(function($) {
    /*
     * jQuery Observer pattern 
     * inspired by @addyosmani 's code
     * see: http://addyosmani.com/resources/essentialjsdesignpatterns/book/#highlighter_506612
     */
    var topics = [];
    function getTopic(id) {
        var callbacks;
        topic = id && topics[id];
        if (!topic) {
            callbacks = $.Callbacks();
            topic = {
                publish: callbacks.fire,
                subscribe: callbacks.add,
                unsubscribe: callbacks.remove
            };
            if (id) topics[id] = topic;
        }
        return topic;
    }
    $.observer = {
        publish: function(id) {
        var args = (2 <= arguments.length) ? Array.prototype.slice.call(arguments, 1) : [];
        var t = getTopic(id);
        return t.publish.apply(t, args);
        },
        subscribe: function(id, fn) {
            return getTopic(id).subscribe(fn);
        },
        unsubscribe: function(id, fn) {
            return getTopic(id).unsubscribe(fn);
        }
    };
})(jQuery);